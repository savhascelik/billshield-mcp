# Alexa+ MCP Toolkit — Developer Friction Log (`billshield-mcp` & `alexa-mcp-kit`)

> **Target Tooling:** `@alexa-ai/addon-local-inspector`, `@modelcontextprotocol/ext-apps` (`ui://`), Streamable HTTP (`2026-07-28` / `2025-11-25` / `2025-06-18`)  
> **Scope:** Engineering feedback documenting 5 real developer friction points encountered while building `billshield-mcp` and how we mitigated them via our open-source [`alexa-mcp-kit`](https://github.com/savhascelik/alexa-mcp-kit) library.

---

## Executive Summary

While building **BillShield MCP** (a 19-tool, 6-widget household financial defense add-on for Alexa+ Web, Echo Show 15, and Echo Dot), we encountered five recurring friction points in the **Streamable HTTP (`2026-07-28` & `2025-11-25` / `2025-06-18`)** and **MCP Apps (`ui://` / `text/html;profile=mcp-app`)** workflow. Rather than patching them with one-off workarounds, we codified deterministic runtime guards and pre-certification checks in **`alexa-mcp-kit`** so any Alexa+ developer can catch them in `<250ms` in CI before launching the heavyweight Playwright-based Local Inspector.

| ID | Component | Severity | Summary of Friction | Status / Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **FL-01** | `tools/list` vs. `tools/call` (`_meta.ui.resourceUri`) | **High** | Dual-binding drift: declaring `_meta.ui.resourceUri` only on `tools/list` (or only on `tools/call`) causes silent widget drop in Inline/Fullscreen transitions. | Solved via `AlexaMcpServer.registerAppTool()` automatic dual injection (`VR-01`). |
| **FL-02** | `Voice-only` Display Mode (`DL-02`) | **High** | Standard MCP tool responses return raw JSON/text arrays (`content: [{ type: "text" }]`), causing Echo Dot / headless sessions to read raw keys or truncate numbers unless a concise spoken summary + SSML prosody block is provided. | Enforced `voiceSummary` contract + `<speak>` SSML synthesis (`DL-02`). |
| **FL-03** | Protocol Version Skew (`2026-07-28` Stateless vs. `2025-06-18` / `2025-11-25` Stateful) | **High** | The latest MCP spec (`2026-07-28`) pivoted to stateless HTTP (`MCP-Protocol-Version` header, no required `initialize`), while `@alexa-ai/addon-local-inspector` still sends `2025-06-18` / `2025-11-25` stateful `initialize` + `Mcp-Session-Id` handshakes. | Built multi-revision negotiation (`2026-07-28`, `2025-11-25`, `2025-06-18`, `2025-03-26`) + `-32022` error compliance (`DL-01`). |
| **FL-04** | Multi-Mode Iframe Hydration (`Inline` ↔ `Fullscreen` ↔ `Voice-only`) | **Medium** | Switching display modes inside the Local Inspector reloads or resizes the `ui://` iframe without preserving interactive selection state unless `ui/setDisplayMode` `postMessage` events toggle pre-rendered DOM sections. | Built single-DOM 3-panel adaptive shell (`createAlexaUiWidget`, `VR-02`). |
| **FL-05** | Far-Field Accessibility (`VR-03` Contrast & `VR-04` Touch Targets) | **Medium** | Standard web UI components use `32px` buttons and `3.2:1` muted gray badges that fail Echo Show 10-foot viewing distance and 44x44px touch ergonomics only at final certification time. | Added build-time W3C WCAG 2.1 contrast math (`5.93:1 min`) and `48px` touch target enforcement. |
| **FL-06** | `@alexa-ai/cli` Installation & Private AWS CodeArtifact Registry (`372468808636`) | **High / Blocker** | Running `npm install -g @alexa-ai/cli` fails with `E404 Not Found` on public npm unless the developer's AWS account is pre-allowlisted by an Alexa Solutions Architect to assume `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead`. | Built open-source `alexa-mcp-kit` CLI (`init`, `audit`, `simulate`) + deployed public Streamable HTTP endpoint (`https://billshield-mcp.duckdns.org/mcp`). |
| **FL-07** | Mandatory OAuth 2.1 + RFC 9728 PRM for Stateless Public-Data MCP Servers | **Medium** | The Alexa+ MCP QuickStart Authentication Checklist requires `401 Unauthorized` + OAuth 2.1 PKCE (`S256`) even for stateless public utility MCP tools that do not store user accounts. | Maintained stateless Streamable HTTP MCP access for immediate testing while documenting stateless session handling. |

---

## Detailed Friction Reports

### FL-01: Dual-Binding Drift on `_meta.ui.resourceUri` Between `tools/list` and `tools/call`
- **Component:** MCP Apps Extension (`@modelcontextprotocol/ext-apps`) & `@alexa-ai/addon-local-inspector` (`VR-01`)
- **What Happened:** When registering an MCP tool, developers naturally attach `_meta: { ui: { resourceUri: "ui://billshield/autopsy-board" } }` to the tool definition returned by `tools/list`. However, when the tool is actually invoked via `tools/call`, returning a standard MCP `{ content: [...], structuredContent: {...} }` payload *without* repeating `_meta.ui.resourceUri` in the `tools/call` result causes the host canvas to lose its active resource binding during dynamic tool chaining (e.g., clicking *"Draft Official Dispute Packet"* inside the Bill Autopsy widget to transition to `ui://billshield/claim-packet`).
- **Root Cause:** The MCP Apps host relies on `tools/list` metadata for static pre-fetching, but relies on `tools/call` result `_meta.ui.resourceUri` for runtime card transitions triggered via iframe `postMessage` (`method: "tools/call"`).
- **How We Solved It:** In `alexa-mcp-kit`, `registerAppTool({ name, resourceUri, ... })` stores `resourceUri` once as the single source of truth and automatically injects `_meta.ui.resourceUri` and `_meta.ui.displayModes` into **both** the `tools/list` schema response and every `tools/call` execution result. Our auditor (`VR-01`) tests both endpoints and fails certification if they diverge.
- **Recommendation for Amazon Alexa+ Team:** Document in the Alexa+ MCP Quickstart that `tools/call` responses should echo `_meta.ui.resourceUri` when chaining tools from an interactive widget, or update the host bridge to fall back to the `tools/list` catalog mapping when `tools/call` omits `_meta.ui`.

---

### FL-02: Missing First-Class Spoken Summary & SSML Contract for `Voice-only` Mode
- **Component:** Alexa+ Multi-Modal Host (`Voice-only` Display Mode / Rule `DL-02`)
- **What Happened:** Household financial tools return dense tabular data (e.g., 6 CPT medical billing codes, NCCI unbundling citations, and regional kWh tariff matrices). When tested in `Voice-only` mode (simulating an Echo Dot or Echo Auto), relying on the default MCP `content[0].text` fallback either reads out raw JSON/markdown tables or forces the LLM to re-summarize numbers on the fly—risking hallucinated dollar totals.
- **Root Cause:** Standard MCP has no dedicated field separating *visual structured payload* (`structuredContent`) from *verified spoken synthesis* (`_meta.voice.summary` + `<speak>` SSML).
- **How We Solved It:** `AlexaMcpServer` enforces `strictVoiceSummary: true` at runtime. Every tool handler in `billshield-mcp` returns a deterministic, human-paced `voiceSummary` (e.g., *"I audited your $1,168.50 bill from Metro Regional Hospital and found 4 billing violations totaling $876.36 in overcharges..."*) which `AlexaMcpServer` automatically wraps into `_meta.voice.summary` and `<speak><prosody rate="medium">...</prosody></speak>` SSML.
- **Recommendation for Amazon Alexa+ Team:** Standardize `_meta.voice.summary` and `_meta.voice.ssml` in the official Alexa+ MCP specification so developers can provide deterministic, compliance-verified spoken readouts alongside `structuredContent`.

---

### FL-03: Protocol Version Skew Between MCP `2026-07-28` (Stateless HTTP) and `@alexa-ai/addon-local-inspector` (`2025-06-18` / `2025-11-25` Stateful Session)
- **Component:** MCP Streamable HTTP Transport (`2026-07-28` vs. `2025-11-25` / `2025-06-18` / Rule `DL-01`)
- **What Happened:** In July 2026, the upstream Model Context Protocol specification (`2026-07-28`) made a major architectural shift toward **stateless HTTP**—carrying version metadata via the `MCP-Protocol-Version` header and `_meta["io.modelcontextprotocol/protocolVersion"]` while removing the mandatory `initialize` / `Mcp-Session-Id` handshake. However, `@alexa-ai/addon-local-inspector` (and existing Alexa+ documentation) still initiates connections using the stateful `2025-06-18` / `2025-11-25` handshake (`initialize` -> `Mcp-Session-Id` header -> `202 Accepted` on `notifications/initialized`). A server built strictly for `2026-07-28` fails in the Local Inspector, while a server hardcoded to `2025-06-18` rejects modern `2026-07-28` clients.
- **How We Solved It:** `AlexaMcpServer` implements **Universal Multi-Revision Negotiation** across `["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]`. It defaults to `2026-07-28` (emitting both `MCP-Protocol-Version` headers and `_meta["io.modelcontextprotocol/protocolVersion"]`), seamlessly negotiates `2025-06-18` or `2025-11-25` with `Mcp-Session-Id` when `@alexa-ai/addon-local-inspector` connects, returns `202 Accepted` on `notifications/initialized`, and returns spec-compliant `-32022` (`UnsupportedProtocolVersionError`) for unknown versions.
- **Recommendation for Amazon Alexa+ Team:** Update `@alexa-ai/addon-local-inspector` to support both `2026-07-28` (`MCP-Protocol-Version` header) and `2025-11-25` / `2025-06-18` handshakes, and document multi-revision negotiation in the Alexa+ MCP Developer Guide.

---

### FL-04: Zero-Flicker Switching Across `Inline`, `Fullscreen`, and `Voice-only` Display Modes
- **Component:** `ui://` Resource Rendering (`text/html;profile=mcp-app` / Rule `VR-02`)
- **What Happened:** When testing widgets in the Local Inspector, toggling between `Inline` (compact chat card), `Fullscreen` (Echo Show 15 split-screen table), and `Voice-only` (spoken transcript + SSML preview) caused layout jumps or lost DOM state when each mode was implemented as a separate route or required a full re-render.
- **How We Solved It:** `createAlexaUiWidget()` in `alexa-mcp-kit` compiles all three views into a single self-contained HTML5 document (`<section class="mode-panel" data-mode-panel="inline|fullscreen|voice-only">`) controlled by `<body data-display-mode="...">`. It listens for both host `postMessage` (`method: "ui/setDisplayMode"`) and built-in `48px` mode-switcher pills, achieving `0ms` network latency when switching display modes.
- **Recommendation for Amazon Alexa+ Team:** Document the exact `postMessage` payload (`{ jsonrpc: "2.0", method: "ui/setDisplayMode", params: { mode: "inline" | "fullscreen" | "voice-only" } }`) in the MCP Apps widget specification so widgets can switch modes reactively without reloading the iframe.

---

### FL-05: Catching WCAG 2.1 AA Contrast (`>= 4.5:1`) and `44x44px` Touch Targets Before Browser Inspection
- **Component:** `@alexa-ai/addon-local-inspector` Visual Rules (`VR-03` & `VR-04`)
- **What Happened:** Far-field smart displays (Echo Show 8 / 15) require high-contrast dark surfaces (`>= 4.5:1` WCAG AA) and large touch targets (`>= 44x44px`). Discovering that a secondary badge color is `3.8:1` or a button is `36px` tall only after spinning up a full headless browser inspector slows down iteration.
- **How We Solved It:** We built `auditThemeAccessibility()` and `inspectHtmlAccessibility()` directly into `createAlexaUiWidget()`. Every widget computes exact W3C relative luminance contrast ratios at build time (our dark-slate theme achieves `6.47:1` minimum contrast across all foreground/background CSS variable pairs and `48px` minimum touch target height), while `inspectHtmlAccessibility()` parses the actual `<style>` CSS color variables and `.touch-target` rules during pre-certification auditing.
- **Recommendation for Amazon Alexa+ Team:** Provide a lightweight static HTML/CSS pre-check CLI flag (similar to `npx alexa-mcp-audit`) alongside the full Playwright Local Inspector so CI pipelines can gate commits in `<250ms`.

---

### FL-06: Installing `@alexa-ai/cli` Fails with HTTP 404 Without Prior Alexa Solutions Architect AWS IAM Allowlisting
- **Specific Task Attempted:** Install the Alexa AI CLI (`@alexa-ai/cli`) to scaffold `addon.json` and deploy our Streamable HTTP MCP server (`https://billshield-mcp.duckdns.org/mcp`) to the Alexa+ Developer Console.
- **Steps Taken:**
  1. Opened the official Alexa+ MCP QuickStart Guide (`/docs/alexaplus/add-ons/mcp-toolkit-quickstart`).
  2. Ran `npm install -g @alexa-ai/cli` on Node.js v24.
  3. Investigated the failure in Set Up Your Development Environment (`/docs/alexaplus/add-ons/set-up-your-development-environment`), which revealed Step 1 & Step 4 require assuming `arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead` (granted by an Alexa Solutions Architect) to authenticate against a private AWS CodeArtifact registry (`domain: alexa-ai`, `domain-owner: 372468808636`, `region: us-west-2`).
- **Expected vs. Actual Result:**
  - **Expected:** A publicly installable CLI tool (or a self-service developer sign-up flow) so independent developers and hackathon participants can run `npm install -g @alexa-ai/cli` and `alexa-ai configure`.
  - **Actual:** `npm error code E404 - 404 Not Found - GET https://registry.npmjs.org/@alexa-ai%2fcli - Not found`, blocking CLI installation for developers whose AWS Account ID is not pre-allowlisted for the private CodeArtifact registry.
- **Severity Rating:** **High / Blocker** (for independent developers without an assigned Alexa Solutions Architect).
- **Workaround Used:** We implemented the Streamable HTTP MCP specification (`2025-11-25`) directly using `@modelcontextprotocol/sdk`, deployed our live HTTPS endpoint (`https://billshield-mcp.duckdns.org/mcp`), verified zero-hint cold invocation across external MCP clients (Claude), and built our own open-source CLI and browser-based Echo Show simulator (`alexa-mcp-kit`).
- **Actionable Suggestion:** Publish `@alexa-ai/cli` to the public npm registry (even if `alexa-ai deploy` still requires Login with Amazon authentication) and add a clear notice at the top of the MCP QuickStart Guide explaining that `@alexa-ai/cli` is hosted on a private AWS CodeArtifact registry.

---

### FL-07: Mandatory OAuth 2.1 + RFC 9728 PRM Requirement for Stateless, Public-Data MCP Servers
- **Specific Task Attempted:** Review the Authentication Checklist in the Alexa+ MCP QuickStart Guide for connecting a stateless public utility MCP server.
- **Steps Taken:**
  1. Reviewed the MCP requirements section of `/docs/alexaplus/add-ons/mcp-toolkit-quickstart`.
  2. Checked the Discovery and Authorization requirements, which state that the MCP server must return `401 Unauthorized` for unauthenticated requests and host Protected Resource Metadata (RFC 9728) plus `/.well-known/oauth-authorization-server` with PKCE `S256`.
- **Expected vs. Actual Result:**
  - **Expected:** Support for both authenticated (OAuth 2.1) MCP servers and unauthenticated or API-key public utility MCP servers.
  - **Actual:** The checklist treats OAuth 2.1 Account Linking as mandatory even when the underlying tools only query public consumer protection datasets (CMS Medicare fee schedules, openFDA enforcement API, CPSC recalls, NREL utility tariffs) and require no user account.
- **Severity Rating:** **Medium**.
- **Workaround Used:** Kept our Streamable HTTP MCP endpoint accessible for immediate testing, cold LLM evaluation, and browser simulator inspection while documenting stateless session handling.
- **Actionable Suggestion:** Add an `"authType": "none"` (or `"api_key"`) option in `addon.json` for read-only public MCP add-ons so end users are not forced through an OAuth login flow for public reference queries.

