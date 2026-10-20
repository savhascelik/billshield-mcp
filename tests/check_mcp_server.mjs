import assert from "node:assert/strict";
import { createBillShieldServer } from "../src/server.mjs";

async function runMcpServerSuite() {
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
    const init = await rpc(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "phase2-mcp-verifier", version: "1.0.0" }
    });
    assert.equal(init.result.protocolVersion, "2025-11-25");

    const toolsList = await rpc(2, "tools/list");
    const tools = toolsList.result.tools;
    assert.equal(tools.length, 19, "BillShield must expose all 19 Alexa+ MCP tools (5 api_*, 4 calc_*, 2 ui_*, 5 composite, 2 discovery, 1 codemode)");

    for (const t of tools) {
      assert.ok(
        t?._meta?.ui?.resourceUri?.startsWith("ui://billshield/"),
        `Tool '${t.name}' must have a valid ui://billshield/* resourceUri, got ${t?._meta?.ui?.resourceUri}`
      );
    }

    const toolPayloads = [
      {
        name: "audit_household_bill",
        args: {},
        expectedUri: "ui://billshield/autopsy-board",
        check: (sc) => assert.equal(sc.totalSavings, 876.36)
      },
      {
        name: "optimize_utility_tariff",
        args: { zipCode: "94103" },
        expectedUri: "ui://billshield/tariff-optimizer",
        check: (sc) => assert.ok(sc.annualSavings > 1000)
      },
      {
        name: "find_cash_rebates",
        args: { zipCode: "10001", tenure: "renter", householdIncome: 52000, householdSize: 2 },
        expectedUri: "ui://billshield/rebate-board",
        check: (sc) => assert.equal(sc.totalRebateDollars, 2560)
      },
      {
        name: "scan_household_recalls",
        args: { items: ["Stanley Travel Mug", "Cosori Air Fryer"] },
        expectedUri: "ui://billshield/recall-radar",
        check: (sc) => assert.equal(sc.totalRefundDollars, 154)
      },
      {
        name: "generate_official_dispute_or_claim",
        args: {
          claimType: "BILL_DISPUTE",
          providerName: "Metro Regional Hospital",
          disputedCode: "99285, 36415",
          savingsAmount: 876.36
        },
        expectedUri: "ui://billshield/claim-packet",
        check: (sc) => assert.ok(sc.letterBody.includes("$876.36"))
      }
    ];

    for (const item of toolPayloads) {
      const callResp = await rpc(10, "tools/call", {
        name: item.name,
        arguments: item.args
      });
      assert.ok(
        !callResp.error,
        `Tool '${item.name}' returned RPC error: ${JSON.stringify(callResp.error)}`
      );
      assert.equal(
        callResp.result?._meta?.ui?.resourceUri,
        item.expectedUri,
        `Tool '${item.name}' call must return _meta.ui.resourceUri=${item.expectedUri}`
      );
      assert.ok(
        typeof callResp.result?._meta?.voice?.summary === "string" &&
          callResp.result._meta.voice.summary.length > 20,
        `Tool '${item.name}' must return non-empty _meta.voice.summary`
      );
      item.check(callResp.result.structuredContent);

      // Verify corresponding ui:// resource renders cleanly
      const readResp = await rpc(20, "resources/read", {
        uri: item.expectedUri,
        displayMode: "fullscreen"
      });
      const html = readResp.result?.contents?.[0]?.text || "";
      assert.ok(
        html.includes(`data-alexa-widget-uri="${item.expectedUri}"`),
        `Resource '${item.expectedUri}' must render valid Alexa+ widget HTML`
      );
    }
  } finally {
    await server.close();
  }
}

await runMcpServerSuite();
console.log("[PASS] Phase 2 BillShield MCP Server verified: 19/19 tools and 6/6 ui:// resources passed.");
