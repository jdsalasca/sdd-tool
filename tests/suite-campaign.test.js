const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { __internal } = require("../dist/commands/suite.js");
const { setFlags } = require("../dist/context/flags.js");
const { saveCheckpoint, loadCheckpoint } = require("../dist/commands/autopilot-checkpoint.js");

test("suite campaign policy parses explicit values with bounds", () => {
  const policy = __internal.resolveCampaignPolicy({
    campaignHours: "5",
    campaignMaxCycles: "80",
    campaignSleepSeconds: "12",
    campaignTargetStage: "final_release"
  });
  assert.equal(policy.minRuntimeMinutes, 300);
  assert.equal(policy.maxCycles, 80);
  assert.equal(policy.sleepSeconds, 12);
  assert.equal(policy.targetStage, "final_release");
});

test("suite campaign policy clamps invalid values", () => {
  const policy = __internal.resolveCampaignPolicy({
    campaignHours: "-2",
    campaignMaxCycles: "0",
    campaignSleepSeconds: "-9",
    campaignTargetStage: "invalid-stage"
  });
  assert.equal(policy.minRuntimeMinutes, 0);
  assert.equal(policy.maxCycles, 1);
  assert.equal(policy.sleepSeconds, 0);
  assert.equal(policy.targetStage, "runtime_start");
});

test("suite campaign falls back to create when checkpoint requirement is stale", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-suite-campaign-"));
  const projectName = "CampaignProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "requirements", "done", "REQ-OLD"), { recursive: true });

  setFlags({ output: workspaceRoot, project: projectName });
  saveCheckpoint(projectName, {
    project: projectName,
    reqId: "REQ-OLD",
    seedText: "seed",
    flow: "SOFTWARE_FEATURE",
    domain: "software",
    lastCompleted: "test",
    updatedAt: new Date().toISOString()
  });

  const resume = __internal.chooseResumeStep(projectName);
  assert.equal(resume, "create");
  assert.equal(loadCheckpoint(projectName), null);
});
