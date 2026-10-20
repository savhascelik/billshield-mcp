import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBillShieldServer } from "../src/server.mjs";
import { runCertificationAudit } from "../lib/alexa-mcp-kit/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function auditSimulatorHtml(html) {
  const checks = [
    {
      id: "SIM-01",
      ok: html.includes('id="mcp-widget-iframe"') && html.includes('sandbox="allow-scripts"')
    },
    {
      id: "SIM-02",
      ok:
        html.includes('data-sim-mode="inline"') &&
        html.includes('data-sim-mode="fullscreen"') &&
        html.includes('data-sim-mode="voice-only"')
    },
    {
      id: "SIM-03",
      ok:
        html.includes('data-tool="audit_household_bill"') &&
        html.includes('data-tool="optimize_utility_tariff"') &&
        html.includes('data-tool="find_cash_rebates"') &&
        html.includes('data-tool="scan_household_recalls"') &&
        html.includes('data-tool="generate_official_dispute_or_claim"')
    },
    {
      id: "SIM-04",
      ok: html.includes('method: "ui/setDisplayMode"') && html.includes('msg.method === "tools/call"')
    },
    {
      id: "SIM-05",
      ok: html.includes('id="run-codemode-plan-btn"') && html.includes('id="cm-cf-input"')
    }
  ];
  return {
    passed: checks.every((c) => c.ok),
    checks
  };
}

async function runNormalTest() {
  const server = createBillShieldServer();
  const { url, baseUrl } = await server.listen(0);

  try {
    // 1. Verify GET /simulator HTTP endpoint
    const simRes = await fetch(`${baseUrl}/simulator`);
    assert.equal(simRes.status, 200, "GET /simulator must return HTTP 200");
    assert.ok(simRes.headers.get("content-type")?.includes("text/html"), "GET /simulator must return text/html");
    const simHtml = await simRes.text();
    const simAudit = auditSimulatorHtml(simHtml);
    assert.equal(simAudit.passed, true, "Simulator HTML must pass all 5 structural checks (SIM-01..SIM-05)");

    // 2. Verify Pre-Certification Audit across all 19 tools & 6 ui:// resources
    const { certificationVerdict, inspectionSummary } = await runCertificationAudit({
      endpointUrl: url,
      outDir: rootDir,
      sampleToolCalls: {
        api_lookup_medical_code: { code: "99285" },
        api_lookup_locality_gpci: { zipCode: "90210" },
        calc_medicare_fee_formula: {
          workRvu: 4.0,
          peRvu: 1.48,
          mpRvu: 0.44,
          workGpci: 1.0,
          peGpci: 1.0,
          mpGpci: 1.0,
          conversionFactor: 32.35
        },
        calc_line_item_variance: {
          billedAmount: 1850,
          referenceAmount: 191.51,
          allowedMultiplier: 2.2
        },
        render_echo_show_surface: {
          title: "Agentic Surface Audit",
          voiceSummary: "Dynamic Echo Show surface rendered from agentic calculation.",
          rows: [{ id: "r1", title: "ER Level 5 (99285)", originalLabel: "$1850.00", fairLabel: "$191.51", deltaLabel: "-$1658.49", status: "FLAGGED" }]
        },
        build_dispute_document: {
          recipientName: "Metro Regional Hospital",
          claimType: "MEDICAL_BILL_DISPUTE",
          conversionFactorUsed: 32.35,
          disputedItems: [
            {
              code: "99285",
              description: "Emergency dept visit high severity",
              billedAmount: 1850,
              allowedCeiling: 191.51,
              overchargeAmount: 1658.49,
              formulaTrace: "5.92 RVU * $32.35 = $191.51"
            }
          ]
        },
        search_tools: { query: "medicare", category: "math" },
        describe_tool: { toolName: "calc_medicare_fee_formula" },
        execute_codemode: {
          code: "const med = await codemode.callTool('api_lookup_medical_code', { code: '99285' }); return { code: med.code, workRvu: med.rvu.workRvu };"
        },
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

    assert.equal(certificationVerdict.verdict, "CERTIFIED", "BillShield MCP server must achieve CERTIFIED verdict");
    assert.equal(certificationVerdict.passCount, 7, "All 7 @alexa-ai/addon-local-inspector rules must pass");
    assert.equal(certificationVerdict.failCount, 0, "Zero rules may fail");
    assert.equal(inspectionSummary.toolsInspected, 19, "Must audit all 19 BillShield MCP tools");
    assert.equal(inspectionSummary.resourcesInspected, 6, "Must audit all 6 ui://billshield/* resources");

    // 3. Verify certification artifacts on disk
    const verdictPath = path.join(rootDir, "certification-verdict.json");
    const summaryPath = path.join(rootDir, "inspection-summary.json");
    assert.ok(fs.existsSync(verdictPath), "certification-verdict.json must exist on disk");
    assert.ok(fs.existsSync(summaryPath), "inspection-summary.json must exist on disk");

    const diskVerdict = JSON.parse(fs.readFileSync(verdictPath, "utf8"));
    assert.equal(diskVerdict.verdict, "CERTIFIED");
    assert.equal(diskVerdict.passCount, 7);

    console.log(
      `[PASS] Phase 3 Simulator & Certification Verified: GET /simulator HTTP 200 (${simHtml.length} bytes, 5/5 SIM checks), ` +
      `verdict=${certificationVerdict.verdict} (${certificationVerdict.passCount}/${certificationVerdict.totalRules} rules across ${inspectionSummary.toolsInspected} tools & ${inspectionSummary.resourcesInspected} resources)`
    );
  } finally {
    await server.close();
  }
}

async function runNegativeComplianceChecks() {
  let caughtMutations = 0;

  // Negative check 1: Missing voice-only mode switch in simulator HTML must fail structural check
  const server1 = createBillShieldServer();
  const info1 = await server1.listen(0);
  try {
    const validSim = await (await fetch(`${info1.baseUrl}/simulator`)).text();
    const brokenSim = validSim.replaceAll('data-sim-mode="voice-only"', 'data-sim-mode="missing"');
    const simAudit = auditSimulatorHtml(brokenSim);
    if (!simAudit.passed) {
      caughtMutations += 1;
    } else {
      throw new Error("Negative check failed: corrupted simulator HTML was NOT detected!");
    }
  } finally {
    await server1.close();
  }

  // Negative check 2: Missing voice-summary-text in widget resource must fail certification audit
  const server2 = createBillShieldServer();
  const targetResource = server2.resources.get("ui://billshield/autopsy-board");
  const origRender = targetResource.render;
  targetResource.render = (ctx) => origRender(ctx).replaceAll('id="voice-summary-text"', 'id="broken-voice"');
  const info2 = await server2.listen(0);
  try {
    const { certificationVerdict } = await runCertificationAudit({ endpointUrl: info2.url });
    if (certificationVerdict.verdict === "NOT_CERTIFIED" && certificationVerdict.failCount > 0) {
      caughtMutations += 1;
    } else {
      throw new Error("Negative check failed: missing voice-summary-text in ui://billshield/autopsy-board passed certification!");
    }
  } finally {
    await server2.close();
  }

  // Negative check 3: WCAG CSS contrast failure (< 4.5:1) in widget style must fail VR-03 certification
  const server3 = createBillShieldServer();
  const targetResource3 = server3.resources.get("ui://billshield/tariff-optimizer");
  const origRender3 = targetResource3.render;
  targetResource3.render = (ctx) =>
    origRender3(ctx).replace(/--text-primary:\s*#[0-9a-fA-F]{6}/i, "--text-primary: #223344");
  const info3 = await server3.listen(0);
  try {
    const { certificationVerdict } = await runCertificationAudit({ endpointUrl: info3.url });
    const vr03 = certificationVerdict.rules.find((r) => r.ruleId === "VR-03");
    if (certificationVerdict.verdict === "NOT_CERTIFIED" && vr03 && vr03.status === "FAIL") {
      caughtMutations += 1;
    } else {
      throw new Error("Negative check failed: WCAG contrast violation passed certification!");
    }
  } finally {
    await server3.close();
  }

  assert.equal(caughtMutations, 3, "Must catch all 3 negative simulator & certification boundary cases");
}

await runNormalTest();
await runNegativeComplianceChecks();
