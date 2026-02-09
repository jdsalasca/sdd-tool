const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { canEnterStage, loadStageSnapshot, markStage } = require("../dist/commands/stage-machine.js");

test("stage machine blocks entry when prerequisites are not passed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-stage-"));
  const snapshot = loadStageSnapshot(root);
  const gate = canEnterStage(snapshot, "quality_validation");
  assert.equal(gate.ok, false);
  assert.match(String(gate.reason), /prerequisite stage/i);
});

test("stage machine allows ordered transitions after marking previous stages", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-stage-ordered-"));
  markStage(root, "discovery", "passed", "ok");
  markStage(root, "functional_requirements", "passed", "ok");
  markStage(root, "technical_backlog", "passed", "ok");
  markStage(root, "implementation", "passed", "ok");
  const snapshot = loadStageSnapshot(root);
  const gate = canEnterStage(snapshot, "quality_validation");
  assert.equal(gate.ok, true);
});
