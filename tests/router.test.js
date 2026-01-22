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
