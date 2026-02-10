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
    campaignTargetStage: "final_release",
    campaignStallCycles: "3",
    campaignAutonomous: true
  });
  assert.equal(policy.minRuntimeMinutes, 300);
  assert.equal(policy.maxCycles, 80);
  assert.equal(policy.sleepSeconds, 12);
  assert.equal(policy.targetStage, "final_release");
  assert.equal(policy.stallCycles, 3);
  assert.equal(policy.autonomous, true);
});

test("suite campaign policy clamps invalid values", () => {
  const policy = __internal.resolveCampaignPolicy({
    campaignHours: "-2",
    campaignMaxCycles: "0",
    campaignSleepSeconds: "-9",
    campaignTargetStage: "invalid-stage",
    campaignStallCycles: "0",
    campaignAutonomous: false
  });
  assert.equal(policy.minRuntimeMinutes, 0);
  assert.equal(policy.maxCycles, 1);
  assert.equal(policy.sleepSeconds, 0);
  assert.equal(policy.targetStage, "runtime_start");
  assert.equal(policy.stallCycles, 1);
  assert.equal(policy.autonomous, false);
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

test("suite campaign stage rank reflects passed stage progression", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-suite-rank-"));
  const projectName = "RankProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, ".sdd-stage-state.json"),
    JSON.stringify(
      {
        version: 1,
        stages: {
          discovery: "passed",
          functional_requirements: "passed",
          technical_backlog: "passed",
          implementation: "pending",
          quality_validation: "pending",
          role_review: "pending",
          release_candidate: "pending",
          final_release: "pending",
          runtime_start: "pending"
        },
        history: []
      },
      null,
      2
    ),
    "utf-8"
  );
  setFlags({ output: workspaceRoot, project: projectName });
  assert.equal(__internal.stageRank(projectName), 3);
});

test("suite provider issue detection identifies unusable provider output", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-suite-provider-unusable-"));
  const projectName = "ProviderUnusableProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "sdd-run-status.json"),
    JSON.stringify(
      {
        blockers: ["provider response unusable (see generated-app/provider-debug.md)"]
      },
      null,
      2
    ),
    "utf-8"
  );
  setFlags({ output: workspaceRoot, project: projectName });
  assert.equal(__internal.detectProviderIssueType(projectName), "unusable");
});

test("suite provider issue detection prioritizes quota/capacity failures", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-suite-provider-quota-"));
  const projectName = "ProviderQuotaProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  fs.mkdirSync(path.join(projectRoot, "generated-app"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "generated-app", "provider-debug.md"),
    "# Provider Debug\n\nTerminalQuotaError: exhausted your capacity",
    "utf-8"
  );
  setFlags({ output: workspaceRoot, project: projectName });
  assert.equal(__internal.detectProviderIssueType(projectName), "quota");
});
