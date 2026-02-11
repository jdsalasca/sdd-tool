const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  parseResetHintToMs,
  markModelUnavailable,
  isModelUnavailable,
  listUnavailableModels,
  nextAvailabilityMs,
  clearExpiredModelAvailability
} = require("../dist/providers/model-availability-cache.js");

test("parseResetHintToMs parses composite hour/minute/second hints", () => {
  const ms = parseResetHintToMs("quota will reset after 1h 2m 3s");
  assert.equal(ms, 3723000);
});

test("model availability cache persists unavailable window and expires correctly", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-cache-test-"));
  const previousAppData = process.env.APPDATA;
  const previousXdgState = process.env.XDG_STATE_HOME;
  const previousXdgConfig = process.env.XDG_CONFIG_HOME;
  process.env.APPDATA = sandbox;
  process.env.XDG_STATE_HOME = sandbox;
  process.env.XDG_CONFIG_HOME = sandbox;
  try {
    const now = Date.now();
    markModelUnavailable("gemini", "gemini-3-pro-preview", "2s", 60000, now);
    assert.equal(isModelUnavailable("gemini", "gemini-3-pro-preview", now + 1000), true);
    assert.equal(isModelUnavailable("gemini", "gemini-3-pro-preview", now + 3000), false);

    const unavailable = listUnavailableModels("gemini", now + 1000);
    assert.ok(unavailable.includes("gemini-3-pro-preview"));

    const nextMs = nextAvailabilityMs("gemini", now + 1000);
    assert.ok(typeof nextMs === "number" && nextMs > 0);

    clearExpiredModelAvailability(now + 5000);
    assert.equal(isModelUnavailable("gemini", "gemini-3-pro-preview", now + 5000), false);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    if (previousXdgState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousXdgState;
    if (previousXdgConfig === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdgConfig;
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

