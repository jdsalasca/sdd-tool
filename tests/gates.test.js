const test = require("node:test");
const assert = require("node:assert/strict");

const { checkRequirementGates } = require("../dist/validation/gates.js");

test("checkRequirementGates reports missing mandatory fields", () => {
  const result = checkRequirementGates({
    objective: "N/A",
    scope: { in: [], out: [] },
    acceptanceCriteria: [],
    nfrs: { security: "", performance: "", availability: "" }
  });

  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("objective"));
  assert.ok(result.missing.includes("scope.in"));
  assert.ok(result.missing.includes("acceptanceCriteria"));
  assert.ok(result.missing.includes("nfrs.security"));
});

test("checkRequirementGates accepts valid inputs", () => {
  const result = checkRequirementGates({
    objective: "Ship faster",
    scope: { in: ["cli"], out: ["ui"] },
    acceptanceCriteria: ["tests pass"],
    nfrs: { security: "owasp", performance: "p95 < 200ms", availability: "99.9%" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.missing.length, 0);
});
