const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runNodeScript(scriptRelPath, args = []) {
  const scriptPath = path.join(__dirname, "..", scriptRelPath);
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf-8" });
}

test("verify-release-version fails on mismatched tag", () => {
  const result = runNodeScript("scripts/verify-release-version.js", ["--tag", "v9.9.9"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /\[SDD-3003\]/i);
});

test("check-error-codes passes for monitored core files", () => {
  const result = runNodeScript("scripts/check-error-codes.js");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Error-code check OK/i);
});
