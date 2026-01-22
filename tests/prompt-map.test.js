const test = require("node:test");
const assert = require("node:assert/strict");

const { mapAnswersToRequirement } = require("../dist/router/prompt-map.js");

test("mapAnswersToRequirement picks objective and acceptance by keywords", () => {
  const answers = {
    "Objective (measurable)": "Ship faster",
    "Acceptance criteria list": "All tests pass",
    "Scope details": "In scope: CLI, Out of scope: UI"
  };

  const mapped = mapAnswersToRequirement(answers);
  assert.equal(mapped.objective, "Ship faster");
  assert.equal(mapped.acceptance_criteria, "All tests pass");
  assert.equal(mapped.scope_in, "In scope: CLI, Out of scope: UI");
});
