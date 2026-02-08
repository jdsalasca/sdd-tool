const test = require("node:test");
const assert = require("node:assert/strict");

const { getFlags, setFlags } = require("../dist/context/flags.js");

test("setFlags preserves previous values on partial updates", () => {
  setFlags({
    approve: true,
    improve: true,
    parallel: true,
    project: "Alpha",
    output: "C:/tmp/sdd",
    iterations: 3
  });

  setFlags({ output: "C:/tmp/next" });
  let current = getFlags();
  assert.equal(current.approve, true);
  assert.equal(current.improve, true);
  assert.equal(current.parallel, true);
  assert.equal(current.project, "Alpha");
  assert.equal(current.output, "C:/tmp/next");
  assert.equal(current.iterations, 3);

  setFlags({ project: "Beta" });
  current = getFlags();
  assert.equal(current.approve, true);
  assert.equal(current.improve, true);
  assert.equal(current.parallel, true);
  assert.equal(current.project, "Beta");
  assert.equal(current.output, "C:/tmp/next");
  assert.equal(current.iterations, 3);
});
