import assert from "node:assert/strict";
import { auditHouseholdBill } from "../src/engines/bill-autopsy.mjs";
import { optimizeUtilityTariff } from "../src/engines/utility-tariff.mjs";
import { findCashRebates } from "../src/engines/rebate-finder.mjs";
import { scanHouseholdRecalls } from "../src/engines/recall-scanner.mjs";
import { generateOfficialDisputeOrClaim } from "../src/engines/dispute-generator.mjs";

async function runEnginesSuite() {
  // 1. Bill Autopsy Engine Check (Upcoding + NCCI Unbundling + Duplicate + Modem Junk Fee)
  const billResult = auditHouseholdBill({
    providerName: "Metro Hospital & Broadband",
    visitComplexity: "moderate",
    customerOwnsModem: true,
    lineItems: [
      { code: "99285", description: "Level 5 ER Visit", billedAmount: 950.0 }, // downgraded to 99284 ceiling $194.00 -> saves $756.00
      { code: "80053", description: "Comprehensive Metabolic Panel", billedAmount: 28.78 }, // within $28.78 ceiling -> saves $0
      { code: "36415", description: "Routine Venipuncture", billedAmount: 36.0 }, // NCCI bundled into 80053 -> saves $36.00
      { code: "71046", description: "Chest X-Ray", billedAmount: 69.36 }, // within ceiling -> saves $0
      { code: "71046", description: "Chest X-Ray (Duplicate)", billedAmount: 69.36 }, // duplicate -> saves $69.36
      { code: "ISP-MODEM", description: "Router Rental Fee", billedAmount: 15.0 } // illegal equipment fee -> saves $15.00
    ]
  });

  assert.equal(billResult.totalBilled, 1168.5, "Total billed must equal $1,168.50");
  assert.equal(billResult.totalFair, 292.14, "Total fair benchmark must equal $292.14");
  assert.equal(
    billResult.totalSavings,
    876.36,
    `Expected exact cent-level savings of $876.36, got $${billResult.totalSavings}`
  );
  assert.equal(billResult.violationCount, 4, "Must catch all 4 distinct billing violations");

  // 1b. Natural-Language Free-Text Bill Audit (No CPT Codes Provided by User)
  const freeTextBill = auditHouseholdBill({
    providerName: "City General ER",
    lineItems: [
      { description: "CT scan head without contrast", billedAmount: 900.0 }, // inferred 70450 ceiling $236.80 -> saves $663.20
      { description: "Monthly wifi gateway rental fee", billedAmount: 18.0 } // inferred ISP-MODEM -> saves $18.00
    ]
  });
  assert.equal(freeTextBill.rows[0].code, "70450", "Must infer CPT 70450 from free-text CT scan description");
  assert.equal(freeTextBill.rows[1].code, "ISP-MODEM", "Must infer ISP-MODEM from free-text router description");
  assert.equal(freeTextBill.totalSavings, 681.2, "Must compute $681.20 savings on free-text bill");

  // 2. OpenEI Utility Tariff Optimizer Check (ZIP 94103 PG&E Northern CA)
  const tariffResult = optimizeUtilityTariff({
    zipCode: "94103",
    appliances: ["dryer", "dishwasher", "ev_charger"]
  });
  assert.equal(tariffResult.utilityName, "Pacific Gas & Electric (PG&E Northern CA)");
  assert.ok(
    tariffResult.totalMonthlySavings > 100,
    `Expected PG&E monthly peak-shift savings > $100, got $${tariffResult.totalMonthlySavings}`
  );
  assert.equal(
    tariffResult.annualSavings,
    Number((tariffResult.totalMonthlySavings * 12).toFixed(2)),
    "Annual savings must equal 12x monthly savings"
  );

  // 2b. 50-State Dynamic Tariff Resolution (ZIP 33101 Miami, FL — outside the 6 static metro prefixes)
  const floridaTariff = optimizeUtilityTariff({
    zipCode: "33101",
    appliances: ["dryer", "ev_charger"]
  });
  assert.ok(
    floridaTariff.utilityName.includes("FPL / Duke FL") &&
      floridaTariff.rateCode === "FL-TOU-2026 Residential",
    `Expected ZIP 33101 to resolve to FPL / Duke FL, got ${floridaTariff.utilityName}`
  );

  // 3. Renter vs Owner Cash Rebate Engine Check
  const renterRebates = findCashRebates({
    zipCode: "10001",
    tenure: "renter",
    householdIncome: 52000,
    householdSize: 2
  });

  assert.equal(renterRebates.incomeTier, "low", "52k in NYC (10001) must qualify for <=80% AMI low-income tier");
  assert.equal(
    renterRebates.rows.every((r) => r.portableForRenter === true),
    true,
    "Renter results must ONLY include portable, non-structural upgrades"
  );
  assert.equal(renterRebates.totalRebateDollars, 2560, "Renter low-income portable rebates must total $2,560");

  // 4. Live CPSC & openFDA Recall Refund Scanner Check (including un-hardcoded live openFDA query)
  const recallResult = await scanHouseholdRecalls(
    {
      items: [
        "Stanley Switchback Travel Mug",
        "Cosori 5.8-Quart Air Fryer",
        "Ordinary Ceramic Plate"
      ]
    },
    { enableLivePing: true }
  );

  assert.equal(recallResult.scannedCount, 3);
  assert.equal(recallResult.matchedCount, 2, "Must match Stanley Mug and Cosori Air Fryer recalls");
  assert.equal(
    recallResult.totalRefundDollars,
    154.0,
    "Combined no-receipt recall refunds ($35 + $119) must equal $154.00"
  );

  if (recallResult.liveChecked) {
    const liveFdaQuery = await scanHouseholdRecalls(
      { items: ["Peanut Butter"] },
      { enableLivePing: true }
    );
    assert.equal(
      liveFdaQuery.rows[0].status,
      "LIVE_FDA_RECALL_MATCH",
      "Arbitrary item 'Peanut Butter' (not in static ledger) must match live api.fda.gov enforcement database"
    );
  }

  // 5. Official Dispute & Claim Packet Generator Check
  const disputePacket = generateOfficialDisputeOrClaim({
    claimType: "BILL_DISPUTE",
    providerName: "Metro Hospital",
    disputedCode: "99285, 36415",
    savingsAmount: 876.36
  });
  assert.ok(
    disputePacket.letterBody.includes("$876.36") &&
      disputePacket.legalBasis.includes("No Surprises Act"),
    "Dispute packet must include exact dollar amount and statutory citation"
  );

  return {
    billSavings: billResult.totalSavings,
    tariffAnnualSavings: tariffResult.annualSavings,
    renterRebates: renterRebates.totalRebateDollars,
    recallRefunds: recallResult.totalRefundDollars,
    openFdaLiveChecked: recallResult.liveChecked
  };
}

const metrics = await runEnginesSuite();
console.log(
  `[PASS] Phase 1 Engines verified: billSavings=$${metrics.billSavings}, tariffAnnual=$${metrics.tariffAnnualSavings}/yr, renterRebates=$${metrics.renterRebates}, recallRefunds=$${metrics.recallRefunds} (openFDA livePing=${metrics.openFdaLiveChecked}).`
);
