const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

function runNodeScript(scriptRelPath, args = [], cwd = undefined) {
  const scriptPath = path.join(__dirname, "..", scriptRelPath);
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf-8", cwd });
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

test("verify-publish-ready fails with SDD-3010 when package.json is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-verify-publish-"));
  try {
    const result = runNodeScript("scripts/verify-publish-ready.js", [], tempDir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr || result.stdout, /\[SDD-3010\]/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("generate-release-notes fails with SDD-3005 on invalid git range", () => {
  const result = runNodeScript("scripts/generate-release-notes.js", ["--from", "definitely-not-a-ref", "--to", "HEAD"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /\[SDD-3005\]/i);
});
