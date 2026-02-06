const test = require("node:test");
const assert = require("node:assert/strict");

const { loadTemplate } = require("../dist/templates/render.js");

test("loadTemplate throws clear error when template does not exist", () => {
  assert.throws(() => loadTemplate("template-that-does-not-exist"), /Template not found/i);
});
