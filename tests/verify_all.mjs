import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const scripts = [
  "tests/check_engines.mjs",
  "tests/check_mcp_server.mjs",
  "tests/check_simulator_and_cert.mjs",
  "tests/check_phase5_api_tools.mjs",
  "tests/check_phase6_calc_tools.mjs",
  "tests/check_phase7_agentic_flow.mjs"
];

console.log("=== BillShield MCP Verification Suite ===");

for (const relScript of scripts) {
  const fullPath = path.join(rootDir, relScript);
  const output = execFileSync(process.execPath, [fullPath], {
    cwd: rootDir,
    encoding: "utf8"
  });
  process.stdout.write(output);
}

const requiredDocs = ["README.md", "FRICTION_LOG.md", "certification-verdict.json", "inspection-summary.json"];
for (const doc of requiredDocs) {
  const p = path.join(rootDir, doc);
  assert.ok(fs.existsSync(p), `Missing required submission artifact: ${doc}`);
}

console.log(`[PASS] Submission Artifacts Verified (4/4 artifacts present)`);
