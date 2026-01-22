const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeProjectName } = require("../dist/workspace/index.js");

test("normalizeProjectName accepts valid names", () => {
  assert.equal(normalizeProjectName("My Project_1"), "My Project_1");
  assert.equal(normalizeProjectName("Alpha-42"), "Alpha-42");
});

test("normalizeProjectName rejects path traversal", () => {
  assert.throws(() => normalizeProjectName("../secrets"), /path separators/i);
  assert.throws(() => normalizeProjectName(".."), /path separators/i);
});

test("normalizeProjectName rejects unsupported characters", () => {
  assert.throws(() => normalizeProjectName("Bad/Name"), /path separators/i);
  assert.throws(() => normalizeProjectName("Bad@Name"), /letters, numbers/i);
});
