import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBillShieldServer } from "./server.mjs";
import { runCertificationAudit } from "../lib/alexa-mcp-kit/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const server = createBillShieldServer();
const { url } = await server.listen(0);

try {
  const { certificationVerdict, inspectionSummary } = await runCertificationAudit({
    endpointUrl: url,
    outDir: rootDir,
    sampleToolCalls: {
      audit_household_bill: {},
      optimize_utility_tariff: { zipCode: "94103" },
      find_cash_rebates: { zipCode: "10001", tenure: "renter", householdIncome: 52000, householdSize: 2 },
      scan_household_recalls: {},
      generate_official_dispute_or_claim: {
        claimType: "BILL_DISPUTE",
        providerName: "Metro Regional Hospital",
        disputedCode: "99285, 36415, 71046, ISP-MODEM",
        savingsAmount: 876.36
      }
    }
  });

  console.log(
    `[billshield-cert] Verdict: ${certificationVerdict.verdict} (${certificationVerdict.passCount}/${certificationVerdict.totalRules} rules passed across ${inspectionSummary.toolsInspected} tools & ${inspectionSummary.resourcesInspected} resources)`
  );
  console.log(`[billshield-cert] Written: ${path.join(rootDir, "certification-verdict.json")}`);
  console.log(`[billshield-cert] Written: ${path.join(rootDir, "inspection-summary.json")}`);

  if (certificationVerdict.verdict !== "CERTIFIED") {
    process.exitCode = 1;
  }
} finally {
  await server.close();
}
