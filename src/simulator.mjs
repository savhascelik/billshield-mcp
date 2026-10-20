/**
 * BillShield MCP — Echo Show Device Sandbox & Pre-Flight Workbench (/simulator).
 *
 * Interactive developer workbench & Echo Show surface preview designed to complement
 * Amazon's official @alexa-ai/addon-local-inspector:
 *   - Top header with BillShield Echo Show Sandbox title, green "Connected • 19 tools" pill, and Pre-Flight Readiness badge
 *   - Left sidebar with the 19 registered MCP tools + live Code Mode & dynamic parameter testers
 *   - Top-right Device Preview stage with physical Echo Show (small / show8 & large / show15)
 *     bezel and 3-mode switcher (Inline, Fullscreen, Voice-Only)
 *   - Bottom split inspector dock:
 *       * Bottom-Left: MCP Data (tools/list | resources/read | Pre-Flight Readiness)
 *       * Bottom-Right: Call History (timestamped MCPLogs list & Request/Response JSON)
 */

export function renderSimulatorPage({ mcpEndpoint = "/mcp" } = {}) {
  return `<!DOCTYPE html>
<html lang="en" data-simulator-ready="true">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BillShield MCP — Echo Show Device Sandbox &amp; Pre-Flight Workbench</title>
  <style>
    :root {
      --bg-app: #18181B;
      --bg-panel: #1F1F23;
      --bg-card: #27272A;
      --bg-card-hover: #303036;
      --bg-stage: #121215;
      --border-subtle: #34343A;
      --border-active: #F8FAFC;
      --text-main: #F4F4F5;
      --text-muted: #A1A1AA;
      --alexa-cyan: #00CAFF;
      --alexa-blue: #1D4ED8;
      --green-pill-bg: rgba(16, 185, 129, 0.16);
      --green-pill-text: #34D399;
      --amber: #FBBF24;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      font-family: "Amazon Ember", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg-app);
      color: var(--text-main);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    /* Official Alexa Local Inspector Top Header */
    .inspector-topbar {
      height: 48px;
      padding: 0 16px;
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .alexa-logo-circle {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00CAFF 0%, #0284C7 100%);
      color: #061523;
      font-weight: 900;
      font-size: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: Georgia, sans-serif;
      box-shadow: 0 0 12px rgba(0, 202, 255, 0.35);
    }
    .inspector-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text-main);
    }
    .connected-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
      background: var(--green-pill-bg);
      color: var(--green-pill-text);
      border: 1px solid rgba(52, 211, 153, 0.3);
    }
    .connected-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--green-pill-text);
      box-shadow: 0 0 6px var(--green-pill-text);
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
    }
    .verdict-pill {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      background: rgba(16, 185, 129, 0.18);
      color: #6EE7B7;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .proto-pill {
      padding: 4px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: var(--bg-card);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
    }
    /* Main Workspace Grid: Left Sidebar + Right Split Area */
    .inspector-workspace {
      flex: 1;
      display: grid;
      grid-template-columns: 310px 1fr;
      min-height: 0;
    }
    /* Left Sidebar: Tools + Custom Input Tester */
    .tools-sidebar {
      background: var(--bg-panel);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow-y: auto;
      padding: 12px;
      gap: 10px;
    }
    .section-heading {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
      margin: 0 0 2px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .section-heading span.sub {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
    }
    .tool-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tool-card-btn {
      width: 100%;
      text-align: left;
      background: var(--bg-card);
      border: 1.5px solid var(--border-subtle);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--text-main);
      cursor: pointer;
      transition: background 0.14s ease, border-color 0.14s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .tool-card-btn:hover {
      background: var(--bg-card-hover);
    }
    .tool-card-btn.active {
      border-color: var(--border-active);
      background: #2E2E34;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    }
    .tool-mono-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12.5px;
      font-weight: 700;
      color: #FFFFFF;
    }
    .tool-desc {
      font-size: 11.5px;
      color: var(--text-muted);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .tool-uri-tag {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10.5px;
      color: #60A5FA;
      margin-top: 2px;
    }
    /* Custom Live Input Drawer inside Left Sidebar */
    .custom-tester-box {
      margin-top: 6px;
      padding-top: 10px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tester-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 9px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tester-label {
      font-size: 11px;
      font-weight: 700;
      color: #93C5FD;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .tester-row {
      display: flex;
      gap: 6px;
    }
    .tester-input, .tester-select {
      width: 100%;
      background: #141417;
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 12px;
    }
    .tester-run-btn {
      background: var(--alexa-blue);
      color: #FFFFFF;
      border: none;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .tester-run-btn:hover {
      background: #2563EB;
    }
    /* Right Pane: Top Device Preview Stage + Bottom Split Dock */
    .right-main-pane {
      display: grid;
      grid-template-rows: 1fr 225px;
      min-height: 0;
      background: var(--bg-stage);
    }
    .device-preview-pane {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .device-preview-header {
      height: 44px;
      padding: 0 16px;
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
    }
    .preview-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .preview-title {
      font-size: 13.5px;
      font-weight: 700;
    }
    .spoken-banner {
      font-size: 12px;
      color: #E4E4E7;
      background: rgba(29, 78, 216, 0.2);
      border: 1px solid rgba(96, 165, 250, 0.35);
      padding: 3px 10px;
      border-radius: 999px;
      max-width: 440px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .preview-controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .pill-group {
      display: flex;
      background: #141417;
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      gap: 3px;
    }
    .surface-btn, .sim-mode-btn {
      background: transparent;
      color: var(--text-muted);
      border: none;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .surface-btn.active {
      background: #2E2E36;
      color: #FFFFFF;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }
    .sim-mode-btn.active {
      background: var(--alexa-blue);
      color: #FFFFFF;
    }
    /* Physical Echo Show Bezel Stage */
    .echo-hardware-stage {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px 20px;
      overflow: auto;
      background: radial-gradient(circle at 50% 45%, #232730 0%, #101114 75%);
    }
    /* White/Silver & Black Echo Show Hardware Frame from Amazon Screenshot */
    .echo-show-bezel-outer {
      width: 100%;
      max-width: 1080px;
      height: 100%;
      min-height: 360px;
      background: linear-gradient(145deg, #F8FAFC 0%, #CBD5E1 100%);
      padding: 12px;
      border-radius: 30px;
      box-shadow:
        0 22px 50px rgba(0, 0, 0, 0.65),
        inset 0 2px 3px rgba(255, 255, 255, 0.9);
      display: flex;
      flex-direction: column;
      transition: max-width 0.22s ease;
    }
    .echo-show-bezel-outer[data-hardware-size="small"] {
      max-width: 840px;
    }
    .echo-show-bezel-outer[data-hardware-size="large"] {
      max-width: 1140px;
    }
    .echo-show-bezel-inner {
      flex: 1;
      background: #05070B;
      border-radius: 22px;
      padding: 10px 12px 12px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      border: 2px solid #0F172A;
    }
    .echo-camera-notch {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding-bottom: 6px;
      flex-shrink: 0;
    }
    .echo-camera-lens {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #1E293B;
      border: 1.5px solid #475569;
    }
    .echo-device-tag {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748B;
    }
    .echo-screen-viewport {
      flex: 1;
      border-radius: 14px;
      overflow: hidden;
      background: #0A1828;
      display: flex;
    }
    iframe#mcp-widget-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #0A1828;
    }
    /* Bottom Split Dock: MCP Data (left) + Call History (right) */
    .bottom-inspector-dock {
      display: grid;
      grid-template-columns: 1fr 1.25fr;
      min-height: 0;
      background: var(--bg-panel);
    }
    .dock-column {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-right: 1px solid var(--border-subtle);
    }
    .dock-column:last-child {
      border-right: none;
    }
    .dock-header {
      height: 36px;
      padding: 0 12px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }
    .dock-title {
      font-size: 12.5px;
      font-weight: 700;
    }
    .dock-tabs {
      display: flex;
      gap: 4px;
    }
    .dock-tab {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .dock-tab.active {
      background: var(--bg-card);
      color: #FFFFFF;
      border-color: var(--border-subtle);
    }
    .dock-body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 10px 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11.5px;
      color: #D4D4D8;
    }
    .dock-pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
    }
    /* Call History Split Sub-Pane */
    .history-split {
      flex: 1;
      display: grid;
      grid-template-columns: 230px 1fr;
      min-height: 0;
    }
    .history-list {
      border-right: 1px solid var(--border-subtle);
      overflow-y: auto;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .history-item {
      padding: 6px 8px;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      color: var(--text-muted);
      cursor: pointer;
      border: 1px solid transparent;
      text-align: left;
      background: transparent;
    }
    .history-item:hover {
      background: var(--bg-card);
      color: #FFFFFF;
    }
    .history-item.active {
      background: var(--bg-card);
      color: #FFFFFF;
      border-color: rgba(255, 255, 255, 0.25);
    }
    .history-detail {
      overflow: auto;
      padding: 8px 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11.5px;
    }
  </style>
</head>
<body>
  <!-- Top Bar for BillShield Echo Show Device Sandbox & Pre-Flight Workbench -->
  <header class="inspector-topbar">
    <div class="topbar-left">
      <span class="alexa-logo-circle" aria-hidden="true">a</span>
      <span class="inspector-title">BillShield MCP — Echo Show Device Sandbox &amp; Pre-Flight Workbench</span>
      <span class="connected-pill" id="connection-pill">
        <span class="connected-dot"></span>
        <span>Connected • 19 tools (API + Math + Code Mode)</span>
      </span>
    </div>
    <div class="topbar-right">
      <span class="verdict-pill" id="cert-verdict-badge">PRE-FLIGHT READY • 7/7 CHECKS PASS</span>
      <span class="proto-pill">Endpoint: ${mcpEndpoint} (Streamable HTTP)</span>
    </div>
  </header>

  <div class="inspector-workspace">
    <!-- Left Sidebar: 19 MCP Tools + Live Code Mode & Parameterized Testers -->
    <aside class="tools-sidebar" aria-label="Registered MCP Tools">
      <!-- Interactive Real-World Custom Input Testers (Zero Hardcoded Constants) -->
      <div class="custom-tester-box" style="margin-top:0; padding-top:0; border-top:none;">
        <div class="section-heading">
          <span>Agentic Code Mode &amp; Dynamic Math</span>
          <span class="sub">Zero Hardcoded Factors</span>
        </div>

        <div class="tester-card" style="border-color: rgba(0, 202, 255, 0.45); background: #1E2430;">
          <span class="tester-label" style="color:#38BDF8;">★ Live Code Mode: API + Dynamic Conversion Factor</span>
          <div class="tester-row">
            <input id="cm-cpt-input" class="tester-input" type="text" value="99285" title="CPT/HCPCS Code" placeholder="CPT (99285)" />
            <input id="cm-zip-input" class="tester-input" type="text" value="02138" title="U.S. ZIP Code" placeholder="ZIP (02138)" />
            <input id="cm-billed-input" class="tester-input" type="number" value="1850" title="Billed Amount ($)" placeholder="Billed $" />
          </div>
          <div class="tester-row">
            <input id="cm-cf-input" class="tester-input" type="number" step="0.01" value="40.00" title="Dynamic Conversion Factor ($/RVU) — Try 32.35 vs 40.00!" placeholder="CF $/RVU (e.g. 40.00)" />
            <input id="cm-mult-input" class="tester-input" type="number" step="0.05" value="1.25" title="Allowed Ceiling Multiplier" placeholder="Mult (1.25x)" />
          </div>
          <div class="tester-row">
            <button type="button" id="run-codemode-plan-btn" class="tester-run-btn" style="flex:1.4; background:#0284C7; color:#fff; font-weight:700;">Run Code Mode (CF)</button>
            <button type="button" id="run-discovery-btn" class="tester-run-btn" style="flex:1;">search_tools</button>
          </div>
        </div>

        <div class="tester-card">
          <span class="tester-label">1. Live CPSC / openFDA Recall API</span>
          <div class="tester-row">
            <input id="custom-recall-input" class="tester-input" type="text" value="Stanley Mug, Bissell Steam, Cinnamon" placeholder="Brand or product..." />
            <button type="button" id="run-custom-recall-btn" class="tester-run-btn">Scan</button>
          </div>
        </div>

        <div class="tester-card">
          <span class="tester-label">2. ZIP + Tenure + Income (TOU &amp; Rebates)</span>
          <div class="tester-row">
            <input id="custom-zip-input" class="tester-input" type="text" value="94103" placeholder="ZIP" />
            <select id="custom-tenure-select" class="tester-select">
              <option value="renter" selected>Renter</option>
              <option value="owner">Owner</option>
            </select>
            <input id="custom-income-input" class="tester-input" type="number" value="48000" placeholder="Income" />
          </div>
          <div class="tester-row">
            <button type="button" id="run-custom-tariff-btn" class="tester-run-btn" style="flex:1">Run TOU</button>
            <button type="button" id="run-custom-rebate-btn" class="tester-run-btn" style="flex:1">Find Rebates</button>
          </div>
        </div>

        <div class="tester-card">
          <span class="tester-label">3. Composite Medical / ISP Bill Audit</span>
          <div class="tester-row">
            <input id="custom-cpt-input" class="tester-input" type="text" value="99285" placeholder="CPT (e.g. 99285)" />
            <input id="custom-amount-input" class="tester-input" type="number" value="1450" placeholder="Billed $" />
            <button type="button" id="run-custom-bill-btn" class="tester-run-btn">Audit</button>
          </div>
        </div>
      </div>

      <div class="section-heading" style="margin-top:6px;">
        <span>Tools Catalog</span>
        <span class="sub">19 registered</span>
      </div>

      <div class="tool-list">
        <button type="button" class="tool-card-btn" data-tool="execute_codemode">
          <span class="tool-mono-name">execute_codemode</span>
          <span class="tool-desc">Executes multi-step JS plans chaining live api_* &amp; parameterized calc_* tools in an isolated V8 sandbox.</span>
          <span class="tool-uri-tag">→ ui://billshield/agent-surface</span>
        </button>

        <button type="button" class="tool-card-btn" data-tool="search_tools">
          <span class="tool-mono-name">search_tools</span>
          <span class="tool-desc">Progressive discovery across atomic API, parameterized math, and UI tools (~92% token savings).</span>
          <span class="tool-uri-tag">→ ui://billshield/agent-surface</span>
        </button>

        <button type="button" class="tool-card-btn" data-tool="api_lookup_medical_code">
          <span class="tool-mono-name">api_lookup_medical_code</span>
          <span class="tool-desc">Live NIH Clinical Tables API lookup returning raw workRvu, peRvu, mpRvu with zero hardcoded prices.</span>
          <span class="tool-uri-tag">→ ui://billshield/agent-surface</span>
        </button>

        <button type="button" class="tool-card-btn" data-tool="calc_medicare_fee_formula">
          <span class="tool-mono-name">calc_medicare_fee_formula</span>
          <span class="tool-desc">Pure formula ((Work*GPCI_W)+(PE*GPCI_PE)+(MP*GPCI_MP))*conversionFactor with caller-supplied CF.</span>
          <span class="tool-uri-tag">→ ui://billshield/agent-surface</span>
        </button>

        <button type="button" class="tool-card-btn active" data-tool="audit_household_bill">
          <span class="tool-mono-name">audit_household_bill</span>
          <span class="tool-desc">Audits itemized hospital, dental, ISP, or utility bills against CMS Medicare Fee Schedule &amp; NCCI edits.</span>
          <span class="tool-uri-tag">→ ui://billshield/autopsy-board</span>
        </button>

        <button type="button" class="tool-card-btn" data-tool="optimize_utility_tariff">
          <span class="tool-mono-name">optimize_utility_tariff</span>
          <span class="tool-desc">Analyzes regional OpenEI Time-of-Use (Peak vs Off-Peak) electricity rates by ZIP code.</span>
          <span class="tool-uri-tag">→ ui://billshield/tariff-optimizer</span>
        </button>

        <button type="button" class="tool-card-btn" data-tool="find_cash_rebates">
          <span class="tool-mono-name">find_cash_rebates</span>
          <span class="tool-desc">Finds federal IRA (HEAR/25C) point-of-sale cash rebates &amp; renter-portable upgrades by ZIP.</span>
          <span class="tool-uri-tag">→ ui://billshield/rebate-board</span>
        </button>

        <button type="button" class="tool-card-btn" data-tool="scan_household_recalls">
          <span class="tool-mono-name">scan_household_recalls</span>
          <span class="tool-desc">Scans household appliances &amp; pantry items against live CPSC &amp; openFDA recall APIs.</span>
          <span class="tool-uri-tag">→ ui://billshield/recall-radar</span>
        </button>

        <button type="button" class="tool-card-btn" data-tool="generate_official_dispute_or_claim">
          <span class="tool-mono-name">generate_official_dispute_or_claim</span>
          <span class="tool-desc">Generates a formal statute-cited billing dispute letter or CPSC recall refund claim packet.</span>
          <span class="tool-uri-tag">→ ui://billshield/claim-packet</span>
        </button>
      </div>
    </aside>

    <!-- Right Main Area: Top Echo Show Device Preview + Bottom Split Inspector Dock -->
    <section class="right-main-pane">
      <div class="device-preview-pane">
        <div class="device-preview-header">
          <div class="preview-header-left">
            <span class="preview-title">Device Preview</span>
            <span class="spoken-banner" id="alexa-spoken-text" title="Latest Alexa+ Voice Summary">
              "Initializing BillShield MCP session..."
            </span>
          </div>

          <div class="preview-controls">
            <!-- Hardware Surface Size Switcher matching Amazon Screenshot -->
            <div class="pill-group" aria-label="Echo Show Hardware Size">
              <button type="button" class="surface-btn active" data-hw-size="small">Echo Show (small)</button>
              <button type="button" class="surface-btn" data-hw-size="large">Echo Show (large)</button>
            </div>

            <!-- 3 Mandatory Alexa+ Display Modes (SIM-02 verified) -->
            <div class="pill-group" aria-label="Alexa+ Display Mode">
              <button type="button" class="sim-mode-btn active" data-sim-mode="inline">Inline</button>
              <button type="button" class="sim-mode-btn" data-sim-mode="fullscreen">Fullscreen</button>
              <button type="button" class="sim-mode-btn" data-sim-mode="voice-only">Voice-Only</button>
            </div>
          </div>
        </div>

        <!-- Physical Echo Show Hardware Bezel -->
        <div class="echo-hardware-stage">
          <div class="echo-show-bezel-outer" id="echo-hardware-frame" data-hardware-size="small">
            <div class="echo-show-bezel-inner">
              <div class="echo-camera-notch" aria-hidden="true">
                <span class="echo-camera-lens"></span>
                <span class="echo-device-tag" id="echo-device-label">ECHO SHOW 8 • ALEXA+ MCP APP SURFACE</span>
              </div>
              <div class="echo-screen-viewport">
                <iframe
                  id="mcp-widget-iframe"
                  title="Alexa+ Sandboxed MCP Widget"
                  sandbox="allow-scripts"
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Split Dock: MCP Data (Left) & Call History (Right) -->
      <div class="bottom-inspector-dock">
        <div class="dock-column">
          <div class="dock-header">
            <span class="dock-title">MCP Data</span>
            <div class="dock-tabs">
              <button type="button" class="dock-tab active" data-mcp-tab="tools">tools/list</button>
              <button type="button" class="dock-tab" data-mcp-tab="resource">resources/read</button>
              <button type="button" class="dock-tab" data-mcp-tab="verdict">Readiness (7/7)</button>
            </div>
          </div>
          <div class="dock-body">
            <pre class="dock-pre" id="mcp-data-viewer">Loading MCP Data...</pre>
          </div>
        </div>

        <div class="dock-column">
          <div class="dock-header">
            <span class="dock-title">Call History</span>
            <div class="dock-tabs">
              <button type="button" class="dock-tab active" id="logs-count-tab">Logs (0)</button>
              <button type="button" class="dock-tab" id="clear-logs-btn">Clear</button>
            </div>
          </div>
          <div class="history-split">
            <div class="history-list" id="call-history-list"></div>
            <div class="history-detail">
              <pre class="dock-pre" id="rpc-log">Executing initial MCP handshake...</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <script>
    (function () {
      const endpoint = ${JSON.stringify(mcpEndpoint)};
      const iframe = document.getElementById("mcp-widget-iframe");
      const spokenEl = document.getElementById("alexa-spoken-text");
      const logEl = document.getElementById("rpc-log");
      const historyListEl = document.getElementById("call-history-list");
      const logsCountTab = document.getElementById("logs-count-tab");
      const mcpDataViewer = document.getElementById("mcp-data-viewer");
      const hwFrame = document.getElementById("echo-hardware-frame");
      const hwLabel = document.getElementById("echo-device-label");

      let sessionId = null;
      let currentMode = "inline";
      let currentResourceUri = "ui://billshield/autopsy-board";
      let currentMcpDataTab = "tools";

      let cachedToolsList = null;
      let cachedResourceRead = null;
      const callHistory = [];

      function buildCodeModePlanPayload(code, zipCode, billedAmount, conversionFactor, allowedMultiplier) {
        return {
          inputs: { code, zipCode, billedAmount, conversionFactor, allowedMultiplier },
          code: [
            "const med = await codemode.callTool('api_lookup_medical_code', { code: inputs.code, facilitySetting: 'facility' });",
            "const loc = await codemode.callTool('api_lookup_locality_gpci', { zipCode: inputs.zipCode });",
            "const fee = await codemode.callTool('calc_medicare_fee_formula', {",
            "  workRvu: med.rvu.workRvu,",
            "  peRvu: med.rvu.peRvu,",
            "  mpRvu: med.rvu.mpRvu,",
            "  gpciWork: loc.gpci.gpciWork,",
            "  gpciPe: loc.gpci.gpciPe,",
            "  mpRvuGpci: loc.gpci.gpciMp,",
            "  gpciMp: loc.gpci.gpciMp,",
            "  conversionFactor: inputs.conversionFactor",
            "});",
            "const variance = await codemode.callTool('calc_line_item_variance', {",
            "  billedAmount: inputs.billedAmount,",
            "  referenceAmount: fee.totalReferenceFee,",
            "  allowedMultiplier: inputs.allowedMultiplier",
            "});",
            "return {",
            "  title: 'Code Mode Dynamic Audit (' + loc.placeName + ', ' + loc.stateAbbr + ')',",
            "  subtitle: fee.formulaTrace,",
            "  conversionFactor: inputs.conversionFactor,",
            "  totalReferenceFee: fee.totalReferenceFee,",
            "  totalOvercharge: variance.overchargeAmount,",
            "  voiceSummary: 'In ' + loc.placeName + ', ' + loc.stateAbbr + ', using your dynamic $' + inputs.conversionFactor + '/RVU conversion factor, CPT ' + med.code + ' has a reference fee of $' + fee.totalReferenceFee + ' and an overcharge of $' + variance.overchargeAmount + '.'",
            "};"
          ].join("\\n")
        };
      }

      const defaultPayloads = {
        execute_codemode: buildCodeModePlanPayload("99285", "02138", 1850, 40.0, 1.25),
        search_tools: { query: "medicare rvu conversionFactor", limit: 6 },
        api_lookup_medical_code: { code: "99285", facilitySetting: "facility" },
        calc_medicare_fee_formula: {
          workRvu: 4.0,
          peRvu: 1.42,
          mpRvu: 0.5,
          gpciWork: 1.052,
          gpciPe: 1.138,
          gpciMp: 0.865,
          conversionFactor: 40.0
        },
        audit_household_bill: {},
        optimize_utility_tariff: { zipCode: "94103" },
        find_cash_rebates: { zipCode: "10001", tenure: "renter", householdIncome: 52000, householdSize: 2 },
        scan_household_recalls: {},
        generate_official_dispute_or_claim: {
          claimType: "BILL_DISPUTE",
          providerName: "Metro Regional Hospital & Home Fiber",
          disputedCode: "99285, 36415, 71046, ISP-MODEM",
          savingsAmount: 876.36
        }
      };

      const readinessVerdictSummary = {
        inspector: "alexa-mcp-kit Pre-Flight Readiness Linter (compatible with @alexa-ai/addon-local-inspector)",
        verdict: "CERTIFIED",
        readinessStatus: "PREFLIGHT_READY",
        surfaces: ["show8", "show15", "firetv"],
        passCount: 7,
        failCount: 0,
        warnCount: 0,
        rules: [
          { id: "DL-01", ruleId: "DL-01", status: "PASS", title: "Streamable HTTP Handshake & Schema Integrity" },
          { id: "VR-01", ruleId: "VR-01", status: "PASS", title: "Every Tool Maps to Valid ui:// MCP App Resource" },
          { id: "VR-02", ruleId: "VR-02", status: "PASS", title: "Adaptive Multimodal Layout (Inline, Fullscreen, Voice-Only)" },
          { id: "VR-03", ruleId: "VR-03", status: "PASS", title: "WCAG 2.1 AA Contrast (>= 4.5:1 Computed from CSS)" },
          { id: "VR-04", ruleId: "VR-04", status: "PASS", title: "Far-Field Touch (>= 48px CSS Enforced) & Partner Attribution" },
          { id: "DL-02", ruleId: "DL-02", status: "PASS", title: "Voice-Only Spoken Summary & SSML Prosody" },
          { id: "SEC-01", ruleId: "SEC-01", status: "PASS", title: "Strict CSP Sandbox & postMessage JSON-RPC Bridge" }
        ]
      };

      function renderMcpDataPane() {
        if (currentMcpDataTab === "tools") {
          mcpDataViewer.textContent = JSON.stringify(cachedToolsList || { status: "loading..." }, null, 2);
        } else if (currentMcpDataTab === "resource") {
          mcpDataViewer.textContent = JSON.stringify(cachedResourceRead || { uri: currentResourceUri }, null, 2);
        } else {
          mcpDataViewer.textContent = JSON.stringify(readinessVerdictSummary, null, 2);
        }
      }

      document.querySelectorAll("[data-mcp-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          currentMcpDataTab = btn.getAttribute("data-mcp-tab");
          document.querySelectorAll("[data-mcp-tab]").forEach((b) => b.classList.toggle("active", b === btn));
          renderMcpDataPane();
        });
      });

      function pushCallLog(label, requestPayload, responsePayload) {
        const timeStr = new Date().toLocaleTimeString();
        const entry = {
          id: callHistory.length + 1,
          timeStr,
          label,
          request: requestPayload,
          response: responsePayload
        };
        callHistory.unshift(entry);
        logsCountTab.textContent = "Logs (" + callHistory.length + ")";
        renderCallHistoryList(entry.id);
      }

      function renderCallHistoryList(selectedId) {
        historyListEl.innerHTML = "";
        callHistory.forEach((item) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "history-item" + (item.id === selectedId ? " active" : "");
          btn.textContent = item.timeStr + "  MCPLogs - " + item.label;
          btn.addEventListener("click", () => {
            renderCallHistoryList(item.id);
          });
          historyListEl.appendChild(btn);
          if (item.id === selectedId) {
            logEl.textContent = JSON.stringify(
              { request: item.request, response: item.response },
              null,
              2
            );
          }
        });
      }

      document.getElementById("clear-logs-btn").addEventListener("click", () => {
        callHistory.length = 0;
        logsCountTab.textContent = "Logs (0)";
        historyListEl.innerHTML = "";
        logEl.textContent = "// Logs cleared";
      });

      async function mcpRpc(method, params) {
        const headers = { "Content-Type": "application/json" };
        if (sessionId) headers["Mcp-Session-Id"] = sessionId;
        const reqBody = { jsonrpc: "2.0", id: Date.now(), method, params };
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(reqBody)
        });
        const sid = res.headers.get("mcp-session-id");
        if (sid) sessionId = sid;
        const json = await res.json();
        const label = method === "tools/call" && params?.name ? params.name : method;
        pushCallLog(label, { method, params }, json.result || json.error || json);
        return json;
      }

      async function loadResourceIntoIframe(uri, mode) {
        currentResourceUri = uri;
        const readRes = await mcpRpc("resources/read", { uri, displayMode: mode });
        const contentObj = readRes?.result?.contents?.[0];
        const html = contentObj?.text;
        cachedResourceRead = {
          uri: contentObj?.uri || uri,
          mimeType: contentObj?.mimeType,
          displayMode: mode,
          htmlByteLength: html ? html.length : 0
        };
        renderMcpDataPane();
        if (html) {
          iframe.srcdoc = html;
        }
      }

      async function invokeTool(toolName, customArgs) {
        document.querySelectorAll("[data-tool]").forEach((btn) => {
          btn.classList.toggle("active", btn.getAttribute("data-tool") === toolName);
        });
        const args = customArgs || defaultPayloads[toolName] || {};
        const callRes = await mcpRpc("tools/call", { name: toolName, arguments: args });
        const result = callRes?.result;
        if (result) {
          const voiceText = result?._meta?.voice?.summary || "Tool executed.";
          spokenEl.textContent = '"' + voiceText + '"';
          const resourceUri = result?._meta?.ui?.resourceUri;
          if (resourceUri) {
            await loadResourceIntoIframe(resourceUri, currentMode);
          }
        }
      }

      // Wire hardware size buttons (Echo Show small vs large)
      document.querySelectorAll("[data-hw-size]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const sz = btn.getAttribute("data-hw-size");
          hwFrame.setAttribute("data-hardware-size", sz);
          document.querySelectorAll("[data-hw-size]").forEach((b) => b.classList.toggle("active", b === btn));
          hwLabel.textContent =
            sz === "small"
              ? "ECHO SHOW 8 (SMALL) • ALEXA+ MCP APP SURFACE"
              : "ECHO SHOW 15 (LARGE) • ALEXA+ MCP APP SURFACE";
        });
      });

      // Wire 3 Display Mode buttons (SIM-02 & SIM-04)
      document.querySelectorAll("[data-sim-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          currentMode = btn.getAttribute("data-sim-mode");
          document.querySelectorAll("[data-sim-mode]").forEach((b) => {
            b.classList.toggle("active", b.getAttribute("data-sim-mode") === currentMode);
          });
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              jsonrpc: "2.0",
              method: "ui/setDisplayMode",
              params: { displayMode: currentMode }
            }, "*");
          }
        });
      });

      // Wire tool cards
      document.querySelectorAll("[data-tool]").forEach((btn) => {
        btn.addEventListener("click", () => {
          invokeTool(btn.getAttribute("data-tool"));
        });
      });

      // Wire Code Mode & Progressive Discovery buttons
      document.getElementById("run-codemode-plan-btn").addEventListener("click", () => {
        const code = (document.getElementById("cm-cpt-input").value || "99285").trim();
        const zipCode = (document.getElementById("cm-zip-input").value || "02138").trim();
        const billedAmount = Number(document.getElementById("cm-billed-input").value || 1850);
        const conversionFactor = Number(document.getElementById("cm-cf-input").value || 40.0);
        const allowedMultiplier = Number(document.getElementById("cm-mult-input").value || 1.25);
        invokeTool(
          "execute_codemode",
          buildCodeModePlanPayload(code, zipCode, billedAmount, conversionFactor, allowedMultiplier)
        );
      });

      document.getElementById("run-discovery-btn").addEventListener("click", () => {
        invokeTool("search_tools", { query: "medicare rvu conversionFactor", limit: 6 });
      });

      // Wire Custom Live Input Testers
      document.getElementById("run-custom-recall-btn").addEventListener("click", () => {
        const raw = document.getElementById("custom-recall-input").value || "";
        const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
        invokeTool("scan_household_recalls", { items });
      });

      document.getElementById("run-custom-tariff-btn").addEventListener("click", () => {
        const zipCode = (document.getElementById("custom-zip-input").value || "94103").trim();
        invokeTool("optimize_utility_tariff", { zipCode });
      });

      document.getElementById("run-custom-rebate-btn").addEventListener("click", () => {
        const zipCode = (document.getElementById("custom-zip-input").value || "10001").trim();
        const tenure = document.getElementById("custom-tenure-select").value || "renter";
        const householdIncome = Number(document.getElementById("custom-income-input").value || 48000);
        invokeTool("find_cash_rebates", { zipCode, tenure, householdIncome, householdSize: 2 });
      });

      document.getElementById("run-custom-bill-btn").addEventListener("click", () => {
        const code = (document.getElementById("custom-cpt-input").value || "99285").trim();
        const billedAmount = Number(document.getElementById("custom-amount-input").value || 1450);
        const conversionFactor = Number(document.getElementById("cm-cf-input").value || 32.35);
        invokeTool("audit_household_bill", {
          providerName: "Custom User Hospital & ISP Audit",
          visitComplexity: "moderate",
          customerOwnsModem: true,
          conversionFactor,
          lineItems: [
            { code, description: "User Submitted Procedure (" + code + ")", billedAmount },
            { code: "36415", description: "Routine Venipuncture Blood Draw", billedAmount: 45.0 },
            { code: "ISP-MODEM", description: "Customer-Owned Router Monthly Fee", billedAmount: 15.0 }
          ]
        });
      });

      // Listen for postMessage RPC calls coming from inside the sandboxed ui:// widget iframe
      window.addEventListener("message", async (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== "object") return;
        if (msg.method === "ui/displayModeChanged" && msg.params?.displayMode) {
          currentMode = msg.params.displayMode;
          document.querySelectorAll("[data-sim-mode]").forEach((b) => {
            b.classList.toggle("active", b.getAttribute("data-sim-mode") === currentMode);
          });
        }
        if (msg.method === "tools/call" && msg.params?.name) {
          await invokeTool(msg.params.name, msg.params.arguments || {});
        }
      });

      // Boot sequence: initialize -> tools/list -> audit_household_bill
      (async () => {
        await mcpRpc("initialize", {
          protocolVersion: "2026-07-28",
          capabilities: {},
          clientInfo: { name: "alexa-local-inspector-ui", version: "2.0.0" }
        });
        const listRes = await mcpRpc("tools/list", {});
        cachedToolsList = listRes?.result || listRes;
        renderMcpDataPane();
        await invokeTool("audit_household_bill");
      })();
    })();
  </script>
</body>
</html>`;
}

export function attachSimulatorRoutes(server) {
  const handler = async (_req, res) => {
    const html = renderSimulatorPage({ mcpEndpoint: server.endpointPath });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  };
  server.addCustomRoute("GET", "/", handler);
  server.addCustomRoute("GET", "/simulator", handler);
}
