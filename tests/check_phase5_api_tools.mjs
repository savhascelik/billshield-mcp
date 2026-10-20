import assert from "node:assert/strict";
import {
  apiLookupMedicalCode,
  apiLookupLocalityGpci,
  apiQueryFdaEnforcement,
  apiQueryCpscRecalls,
  apiLookupUtilityRates
} from "../src/tools/api-tools.mjs";
import { createBillShieldServer } from "../src/server.mjs";

async function runApiToolsAudit() {
  const opts = { timeoutMs: 3500 };

  // 5.1: api_lookup_medical_code (queries live NIH Clinical Tables API + returns raw RVU components without hardcoded $)
  const med = await apiLookupMedicalCode({ code: "99285", query: "99285" }, opts);
  assert.equal(med.code, "99285");
  assert.equal(med.rvuAvailable, true);
  assert.ok(med.rvuComponents.totalRvu > 0, "workRvu + peRvu + mpRvu must be > 0");
  assert.equal(med.rvuComponents.workRvu, 4.0);
  assert.equal(med.rvuComponents.peRvu, 1.42);
  assert.equal(med.rvuComponents.mpRvu, 0.5);
  assert.equal(
    med.rvuComponents.benchmarkPrice,
    undefined,
    "API tool must NOT return a hardcoded dollar price; it must return raw RVU weights for Alexa+ to pass into calc_medicare_fee_formula!"
  );

  // Verify honest handling of codes outside the embedded CMS RVU subset (no invented RVU numbers)
  const unseeded = await apiLookupMedicalCode({ code: "99999" }, { disableNetwork: true });
  assert.equal(unseeded.rvuAvailable, false, "Unseeded code must report rvuAvailable=false instead of inventing RVUs");
  assert.equal(unseeded.rvu, null, "Unseeded code must return rvu=null");

  // 5.1b: Live openFDA National Drug Code (NDC) lookup inside apiLookupMedicalCode (Task 6.1)
  const drugLookup = await apiLookupMedicalCode({ code: "J2405", query: "ondansetron" }, opts);
  assert.equal(drugLookup.code, "J2405");
  assert.ok(
    drugLookup.sourceMetadata.fdaNdcEndpointUrl &&
      drugLookup.sourceMetadata.fdaNdcEndpointUrl.includes("api.fda.gov/drug/ndc.json"),
    "Drug / J-code lookup must query live api.fda.gov/drug/ndc.json endpoint"
  );

  // 5.2: api_lookup_locality_gpci (queries live api.zippopotam.us for any US ZIP code, e.g. 02139 Cambridge MA)
  const loc = await apiLookupLocalityGpci({ zipCode: "02139" }, opts);
  assert.equal(loc.zipCode, "02139");
  assert.equal(loc.stateCode, "MA", `Expected stateCode='MA' for 02139, got '${loc.stateCode}'`);
  assert.ok(loc.gpci.gpciWork > 1.0, "MA gpciWork must be > 1.0");
  assert.ok(loc.areaMedianIncome4Person > 100000);

  // 5.3: api_query_fda_enforcement (accepts both 'query' and 'searchQuery')
  const fda = await apiQueryFdaEnforcement(
    { domain: "food", query: "cinnamon", limit: 3 },
    opts
  );
  assert.equal(fda.domain, "food", "FDA response must preserve requested domain='food'");
  assert.equal(fda.query, "cinnamon");
  assert.equal(fda.searchQuery, "cinnamon");
  assert.ok(
    fda.sourceMetadata.endpointUrl.includes("api.fda.gov/food/enforcement.json"),
    "FDA tool must target live api.fda.gov endpoint"
  );

  // 5.4: api_query_cpsc_recalls (accepts both 'query' and 'productName')
  const cpsc = await apiQueryCpscRecalls({ query: "sleep", limit: 3 }, opts);
  assert.equal(cpsc.productName, "sleep");
  assert.equal(cpsc.query, "sleep");
  assert.ok(
    cpsc.sourceMetadata.endpointUrl.includes("saferproducts.gov/RestWebServices/Recall"),
    "CPSC tool must target live saferproducts.gov REST API"
  );

  // 5.5: api_lookup_utility_rates (accepts zipCode, stateCode, or stateAbbr)
  const util = await apiLookupUtilityRates({ zipCode: "78701" }, opts);
  assert.equal(util.stateCode, "TX");
  assert.equal(util.stateAbbr, "TX");
  assert.ok(util.utilityName.length > 0);
  assert.ok(util.scheduleCode.includes("TX"));
  assert.ok(
    util.rates.peakRatePerKwh > util.rates.offPeakRatePerKwh,
    `Peak rate (${util.rates.peakRatePerKwh}) must be strictly greater than Off-Peak rate (${util.rates.offPeakRatePerKwh})`
  );

  const utilByStateAbbr = await apiLookupUtilityRates({ stateAbbr: "CA" }, { disableNetwork: true });
  assert.equal(utilByStateAbbr.stateAbbr, "CA");

  // 5.6: End-to-End MCP Server tools/call schema compatibility check (Task 1.2)
  const server = createBillShieldServer();
  const { url } = await server.listen(0, "127.0.0.1");
  try {
    const rpcCall = async (id, name, args) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })
      });
      return res.json();
    };

    const fdaRpc = await rpcCall(101, "api_query_fda_enforcement", { query: "cinnamon", domain: "food", limit: 2 });
    assert.ok(!fdaRpc.error, `MCP tools/call api_query_fda_enforcement failed: ${JSON.stringify(fdaRpc.error)}`);
    assert.ok(!fdaRpc.result._meta.voice.summary.includes("undefined"), "FDA voiceSummary must not contain 'undefined'");

    const cpscRpc = await rpcCall(102, "api_query_cpsc_recalls", { query: "Stanley", limit: 2 });
    assert.ok(!cpscRpc.error, `MCP tools/call api_query_cpsc_recalls failed: ${JSON.stringify(cpscRpc.error)}`);
    assert.ok(!cpscRpc.result._meta.voice.summary.includes("undefined"), "CPSC voiceSummary must not contain 'undefined'");

    const utilRpc = await rpcCall(103, "api_lookup_utility_rates", { stateAbbr: "TX" });
    assert.ok(!utilRpc.error, `MCP tools/call api_lookup_utility_rates failed: ${JSON.stringify(utilRpc.error)}`);
    assert.ok(!utilRpc.result._meta.voice.summary.includes("undefined"), `Utility voiceSummary must not contain 'undefined', got: ${utilRpc.result._meta.voice.summary}`);

    const liveTariffRpc = await rpcCall(104, "optimize_utility_tariff", { zipCode: "33101", appliances: ["dryer"] });
    assert.ok(!liveTariffRpc.error, "optimize_utility_tariff MCP call must succeed");
    assert.ok(
      liveTariffRpc.result.structuredContent.utilityName.includes("FPL / Duke FL"),
      "optimize_utility_tariff must resolve ZIP 33101 via live geolocation API to Florida utility"
    );
  } finally {
    await server.close();
  }

  // Input validation negative checks
  await assert.rejects(() => apiLookupMedicalCode({}), /requires either 'code' or 'query'/);
  await assert.rejects(() => apiLookupLocalityGpci({ zipCode: "12" }), /requires a 5-digit/);
  await assert.rejects(() => apiQueryFdaEnforcement({}), /requires a non-empty/);
  await assert.rejects(() => apiQueryCpscRecalls({}), /requires 'query', 'productName', or 'hazard'/);
  await assert.rejects(() => apiLookupUtilityRates({}), /requires either 'zipCode'/);

  return {
    nihLive: med.sourceMetadata.liveApiCalled,
    zipLive: loc.sourceMetadata.liveApiCalled,
    fdaLive: fda.sourceMetadata.liveApiCalled,
    cpscLive: cpsc.sourceMetadata.liveApiCalled,
    resolvedCity: `${loc.city}, ${loc.stateCode}`,
    txPeak: util.rates.peakRatePerKwh,
    txOffPeak: util.rates.offPeakRatePerKwh
  };
}

async function main() {
  const m = await runApiToolsAudit();
  console.log(
    `[PASS] Phase 5 Atomic API Tools & MCP Schema Compatibility verified (NIH=${m.nihLive}, ZipGeo=${m.zipLive} [${m.resolvedCity}], FDA=${m.fdaLive}, CPSC=${m.cpscLive}, TX_TOU=$${m.txPeak}/$${m.txOffPeak})`
  );
}

main().catch((err) => {
  console.error("[FAIL] Phase 5 API tools check failed:", err);
  process.exit(1);
});
