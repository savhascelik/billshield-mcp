import assert from "node:assert/strict";
import { createBillShieldServer } from "../src/server.mjs";

async function runAgenticFlowSuite() {
  const server = createBillShieldServer();
  const { url } = await server.listen(0, "127.0.0.1");
  let sessionId = null;

  async function rpc(id, method, params = {}) {
    const headers = { "Content-Type": "application/json" };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) sessionId = sid;
    return res.json();
  }

  try {
    // 1. Progressive Tool Discovery: Alexa+ searches for atomic API tools and parameterized math tools
    const searchApiResp = await rpc(1, "tools/call", {
      name: "search_tools",
      arguments: { query: "medical rvu gpci", category: "api" }
    });
    assert.ok(!searchApiResp.error, `search_tools (api) error: ${JSON.stringify(searchApiResp.error)}`);
    const apiFound = searchApiResp.result.structuredContent;
    assert.ok(apiFound.matchCount >= 2, "search_tools(category='api') must find medical & GPCI API tools");
    assert.ok(
      apiFound.tools.some((t) => t.name === "api_lookup_medical_code"),
      "search_tools must surface api_lookup_medical_code"
    );
    assert.ok(
      apiFound.metrics.tokenSavingsPct >= 65,
      `Expected >=65% token savings on discovery, got ${apiFound.metrics.tokenSavingsPct}%`
    );

    const searchMathResp = await rpc(2, "tools/call", {
      name: "search_tools",
      arguments: { query: "medicare conversion factor", category: "math" }
    });
    const mathFound = searchMathResp.result.structuredContent;
    assert.ok(
      mathFound.tools.some((t) => t.name === "calc_medicare_fee_formula"),
      "search_tools(category='math') must surface calc_medicare_fee_formula"
    );

    // 2. Schema Inspection: Alexa+ inspects calc_medicare_fee_formula before writing its Code Mode plan
    const descResp = await rpc(3, "tools/call", {
      name: "describe_tool",
      arguments: { toolName: "calc_medicare_fee_formula" }
    });
    assert.ok(!descResp.error, `describe_tool error: ${JSON.stringify(descResp.error)}`);
    const schemaInfo = descResp.result.structuredContent;
    assert.ok(
      schemaInfo.inputSchema.required.includes("conversionFactor"),
      "describe_tool must show conversionFactor as an agent-supplied required parameter"
    );
    const hintsStr = JSON.stringify(schemaInfo.compositionHints || "");
    assert.ok(
      hintsStr.includes("api_lookup_medical_code"),
      "describe_tool must include upstream composition hints referencing api_lookup_medical_code"
    );

    // 3. End-to-End Code Mode Plan:
    // Alexa+ chains live API lookup -> parameterized Medicare formula ($32.35 vs $40.00) -> variance -> Echo Show UI -> Dispute Packet
    const codeModePlan = `
      const med = await codemode.callTool("api_lookup_medical_code", { code: inputs.code });
      const loc = await codemode.callTool("api_lookup_locality_gpci", { zipCode: inputs.zipCode });

      const fee32 = await codemode.callTool("calc_medicare_fee_formula", {
        workRvu: med.rvu.workRvu,
        peRvu: med.rvu.peRvu,
        mpRvu: med.rvu.mpRvu,
        gpciWork: loc.gpci.gpciWork,
        gpciPe: loc.gpci.gpciPe,
        gpciMp: loc.gpci.gpciMp,
        conversionFactor: inputs.conversionFactorCurrent
      });

      const fee40 = await codemode.callTool("calc_medicare_fee_formula", {
        workRvu: med.rvu.workRvu,
        peRvu: med.rvu.peRvu,
        mpRvu: med.rvu.mpRvu,
        gpciWork: loc.gpci.gpciWork,
        gpciPe: loc.gpci.gpciPe,
        gpciMp: loc.gpci.gpciMp,
        conversionFactor: inputs.conversionFactorFuture
      });

      const variance = await codemode.callTool("calc_line_item_variance", {
        billedAmount: inputs.billedAmount,
        referenceAmount: fee32.totalReferenceFee,
        allowedMultiplier: inputs.allowedMultiplier
      });

      const uiSurface = await codemode.callTool("render_echo_show_surface", {
        title: "Agentic Code Mode Audit • " + med.code,
        subtitle: loc.localityName + " • CF $" + inputs.conversionFactorCurrent + " vs $" + inputs.conversionFactorFuture,
        badge: variance.status,
        voiceSummary: "For CPT " + med.code + " in " + loc.localityName + ", the Medicare fee is $" + fee32.totalReferenceFee + " at $" + inputs.conversionFactorCurrent + " conversion factor, or $" + fee40.totalReferenceFee + " at $" + inputs.conversionFactorFuture + ".",
        metrics: [
          { label: "Fee (CF $" + inputs.conversionFactorCurrent + ")", value: "$" + fee32.totalReferenceFee.toFixed(2) },
          { label: "Fee (CF $" + inputs.conversionFactorFuture + ")", value: "$" + fee40.totalReferenceFee.toFixed(2) },
          { label: "Net Overcharge", value: "$" + variance.overchargeAmount.toFixed(2), tone: "danger" }
        ],
        rows: [
          {
            id: "row-cf-current",
            title: med.officialDescription + " (CF $" + inputs.conversionFactorCurrent + ")",
            subtitle: fee32.formulaTrace,
            originalLabel: "$" + inputs.billedAmount.toFixed(2),
            fairLabel: "$" + fee32.totalReferenceFee.toFixed(2),
            deltaLabel: "-$" + variance.overchargeAmount.toFixed(2),
            status: variance.status,
            citation: med.liveSourceUrl
          },
          {
            id: "row-cf-future",
            title: med.officialDescription + " (CF $" + inputs.conversionFactorFuture + ")",
            subtitle: fee40.formulaTrace,
            originalLabel: "$" + inputs.billedAmount.toFixed(2),
            fairLabel: "$" + fee40.totalReferenceFee.toFixed(2),
            deltaLabel: "-$" + (inputs.billedAmount - fee40.totalReferenceFee).toFixed(2),
            status: "SIMULATED_CF",
            citation: med.liveSourceUrl
          }
        ]
      });

      const dispute = await codemode.callTool("build_dispute_document", {
        recipientName: "Manhattan Emergency Center",
        claimType: "MEDICAL_BILL_DISPUTE",
        conversionFactorUsed: inputs.conversionFactorCurrent,
        disputedItems: [
          {
            code: med.code,
            description: med.officialDescription,
            billedAmount: inputs.billedAmount,
            allowedCeiling: variance.allowedCeiling,
            overchargeAmount: variance.overchargeAmount,
            formulaTrace: fee32.formulaTrace,
            citation: med.liveSourceUrl
          }
        ]
      });

      return {
        voiceSummary: uiSurface.title + " completed with " + variance.overchargeAmount + " dollars savings.",
        med,
        loc,
        fee32,
        fee40,
        variance,
        uiSurface,
        dispute
      };
    `;

    const execResp = await rpc(4, "tools/call", {
      name: "execute_codemode",
      arguments: {
        code: codeModePlan,
        inputs: {
          code: "99285",
          zipCode: "10001",
          billedAmount: 1950.0,
          conversionFactorCurrent: 32.35,
          conversionFactorFuture: 40.0,
          allowedMultiplier: 2.2
        }
      }
    });

    assert.ok(!execResp.error, `execute_codemode error: ${JSON.stringify(execResp.error)}`);
    const cmOut = execResp.result.structuredContent;
    assert.equal(cmOut.stepsCount, 7, "Code Mode plan must execute all 7 chained tool calls in a single turn");

    const planResult = cmOut.result;
    assert.ok(planResult && planResult.fee32 && planResult.fee40, "Code Mode must return both fee32 and fee40 outputs");

    // Verify dynamic conversionFactor math in Manhattan NY (GPCI: Work=1.068, PE=1.215, MP=1.54; RVU: 4.0, 1.42, 0.5)
    // Geographic Adjusted RVU = (4.0*1.068) + (1.42*1.215) + (0.5*1.54) = 4.272 + 1.7253 + 0.77 = 6.7673
    // At CF $32.35 -> $218.92 | At CF $40.00 -> $270.69
    assert.equal(
      planResult.fee32.totalReferenceFee,
      218.92,
      `Expected NY 99285 fee at CF=32.35 to be $218.92, got ${planResult.fee32.totalReferenceFee}`
    );
    assert.equal(
      planResult.fee40.totalReferenceFee,
      270.69,
      `Expected NY 99285 fee at CF=40.00 to be $270.69, got ${planResult.fee40.totalReferenceFee}`
    );
    assert.notEqual(
      planResult.fee32.totalReferenceFee,
      planResult.fee40.totalReferenceFee,
      "Changing conversionFactor must dynamically change the calculated Medicare benchmark"
    );

    // Verify dynamic UI surface rows were preserved
    assert.equal(
      planResult.uiSurface.rowCount,
      2,
      "render_echo_show_surface must preserve both agent-supplied dynamic rows"
    );

    // Verify dispute document includes the dynamic formulaTrace
    assert.ok(
      planResult.dispute.letterBody.includes(planResult.fee32.formulaTrace),
      "Dispute letter body must embed the exact mathematical formulaTrace from calc_medicare_fee_formula"
    );

    return {
      stepsCount: cmOut.stepsCount,
      feeAt32_35: planResult.fee32.totalReferenceFee,
      feeAt40_00: planResult.fee40.totalReferenceFee,
      overchargeAmount: planResult.variance.overchargeAmount,
      tokenSavingsPct: apiFound.metrics.tokenSavingsPct
    };
  } finally {
    await server.close();
  }
}

const stats = await runAgenticFlowSuite();
console.log(
  `[PASS] Phase 7 Agentic Flow Verified: ${stats.stepsCount} chained Code Mode steps | ` +
    `NY 99285 CF $32.35 -> $${stats.feeAt32_35} vs CF $40.00 -> $${stats.feeAt40_00} | ` +
    `Overcharge=$${stats.overchargeAmount} | Discovery Savings=${stats.tokenSavingsPct}%`
);
