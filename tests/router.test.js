const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyIntent } = require("../dist/router/intent.js");

test("classifyIntent detects bug fix intent", () => {
  const result = classifyIntent("App has a crash with stack trace");
  assert.equal(result.intent, "bug_fix");
  assert.equal(result.flow, "BUG_FIX");
});

test("classifyIntent detects generic intent", () => {
  const result = classifyIntent("Tell me something interesting");
  assert.equal(result.intent, "generic");
  assert.equal(result.flow, "GENERIC");
});

test("classifyIntent avoids false PR match on words containing pr", () => {
  const result = classifyIntent("crea una calculadora de escritorio con pruebas");
  assert.notEqual(result.intent, "pr_review");
});

test("classifyIntent avoids false bug_fix on software stack preference", () => {
  const result = classifyIntent(
    "crea una app para notas con persistencia. Build target: web. Preferred stack: javascript."
  );
  assert.notEqual(result.intent, "bug_fix");
});

test("classifyIntent detects software intent in spanish app requests", () => {
  const result = classifyIntent("crea una app para notas con persistencia");
  assert.equal(result.intent, "software");
  assert.equal(result.flow, "SOFTWARE_FEATURE");
});

test("classifyIntent prioritizes software for app requests mentioning history/audit", () => {
  const result = classifyIntent("create a parking registry app with audit history and tests");
  assert.equal(result.intent, "software");
  assert.equal(result.flow, "SOFTWARE_FEATURE");
});
