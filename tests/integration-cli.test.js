const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function createSpecBundle(projectRoot, status, reqId, projectName) {
  const reqDir = path.join(projectRoot, "requirements", status, reqId);
  fs.mkdirSync(reqDir, { recursive: true });

  writeJson(path.join(reqDir, "requirement.json"), {
    id: reqId,
    title: projectName,
    objective: "Objective",
    status,
    actors: ["user"],
    scope: { in: ["in"], out: ["out"] },
    acceptanceCriteria: ["acceptance"],
    nfrs: { security: "sec", performance: "perf", availability: "avail" },
    constraints: [],
    risks: [],
    links: [],
    updatedAt: new Date().toISOString()
  });

  writeJson(path.join(reqDir, "functional-spec.json"), {
    overview: "overview",
    actors: ["user"],
    useCases: ["use-case"],
    flows: ["flow"],
    rules: ["rule"],
    errors: ["error"],
    acceptanceCriteria: ["acceptance"]
  });

  writeJson(path.join(reqDir, "technical-spec.json"), {
    stack: ["node"],
    interfaces: ["api"],
    dataModel: ["model"],
    security: ["secure"],
    errors: ["handled"],
    performance: ["p95"],
    observability: ["logs"]
  });

  writeJson(path.join(reqDir, "architecture.json"), {
    context: "context",
    containers: ["container"],
    components: ["component"],
    deployment: ["deploy"],
    diagrams: ["context.mmd"]
  });

  writeJson(path.join(reqDir, "test-plan.json"), {
    criticalPaths: ["path"],
    edgeCases: ["edge"],
    coverageTarget: "80%",
    acceptanceTests: ["test"],
    regressions: ["regression"]
  });

  writeJson(path.join(reqDir, "quality.json"), {
    rules: ["single-responsibility"],
    thresholds: { coverage: "80%", complexity: "10" },
    profiles: { default: [] }
  });

  return reqDir;
}

function runCli(workspaceRoot, projectName, args, input) {
  const cliPath = path.join(__dirname, "..", "dist", "cli.js");
  const baseArgs = [cliPath, "--output", workspaceRoot];
  if (projectName && projectName.trim().length > 0) {
    baseArgs.push("--project", projectName);
  }
  return spawnSync(process.execPath, [...baseArgs, ...args], {
    input,
    encoding: "utf-8",
    env: { ...process.env, SDD_STDIN: "1" }
  });
}

test("req finish rolls back directory move when post-move step fails", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-finish-"));
  const projectName = "RollbackProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  const reqId = "REQ-ROLLBACK";

  const sourceDir = createSpecBundle(projectRoot, "in-progress", reqId, projectName);
  fs.mkdirSync(path.join(sourceDir, "decision-log"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "decision-log", "ADR-0001.md"), "# ADR", "utf-8");

  const conflictingTarget = path.join(projectRoot, "decision-log", reqId);
  fs.mkdirSync(conflictingTarget, { recursive: true });
  fs.writeFileSync(path.join(conflictingTarget, "existing.md"), "# existing", "utf-8");

  const result = runCli(workspaceRoot, projectName, ["req", "finish"], `${reqId}\noverview\nrun\narch\ntest\n`);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Failed to finish requirement/i);
  assert.equal(fs.existsSync(sourceDir), true);
  assert.equal(fs.existsSync(path.join(projectRoot, "requirements", "done", reqId)), false);
});

test("req report validates project readme from project root", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-report-"));
  const projectName = "ReportProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  const reqId = "REQ-REPORT";

  createSpecBundle(projectRoot, "backlog", reqId, projectName);
  writeJson(path.join(projectRoot, "project-readme.json"), {
    projectName,
    overview: "overview",
    howToRun: "run",
    architectureSummary: "summary",
    specs: {
      requirements: `requirements/backlog/${reqId}/requirement.md`,
      functionalSpec: `requirements/backlog/${reqId}/functional-spec.md`,
      technicalSpec: `requirements/backlog/${reqId}/technical-spec.md`,
      architecture: `requirements/backlog/${reqId}/architecture.md`
    },
    testingNotes: "notes"
  });

  const result = runCli(workspaceRoot, projectName, ["req", "report"], `${reqId}\n`);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /OK: \.\.\/project-readme\.json/);
  assert.match(result.stdout, /Missing files: 0/);
});

test("req export copies nested directories recursively", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-export-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-export-out-"));
  const projectName = "ExportProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  const reqId = "REQ-EXPORT";

  const sourceDir = createSpecBundle(projectRoot, "done", reqId, projectName);
  fs.mkdirSync(path.join(sourceDir, "decision-log"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "decision-log", "ADR-0001.md"), "# Decision", "utf-8");

  const result = runCli(workspaceRoot, projectName, ["req", "export"], `${reqId}\n${outputRoot}\n`);
  const exportedAdr = path.join(outputRoot, `${projectName}-${reqId}`, "decision-log", "ADR-0001.md");

  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(exportedAdr), true);
});

test("hello default mode runs full autopilot pipeline to done", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-auto-"));
  const projectName = "HelloAutopilotProject";

  const result = runCli(
    workspaceRoot,
    projectName,
    ["hello"],
    "y\nBuild a beginner-friendly onboarding flow for users\nn\n"
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Autopilot completed successfully/i);

  const doneRoot = path.join(workspaceRoot, projectName, "requirements", "done");
  assert.equal(fs.existsSync(doneRoot), true);
  const doneEntries = fs.readdirSync(doneRoot);
  assert.equal(doneEntries.length > 0, true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, projectName, "project-readme.json")), true);
});

test("hello supports non-interactive mode with defaults", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-non-interactive-"));
  const result = runCli(
    workspaceRoot,
    "",
    ["--non-interactive", "hello", "Build an inventory tracker for a small store"],
    ""
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Autopilot completed successfully/i);
  assert.match(result.stdout, /Using project: autopilot-/i);
});

test("hello auto-guides with direct input and minimal prompts", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-direct-"));
  const result = runCli(workspaceRoot, "", ["hello", "Create a task tracker for first-time developers"], "");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Auto-guided mode active/i);
  assert.match(result.stdout, /Using project: autopilot-/i);
  assert.match(result.stdout, /Autopilot completed successfully/i);
});

test("hello resumes from checkpoint with --from-step", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-resume-"));
  const projectName = "ResumeProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  const reqId = "REQ-RESUME";

  createSpecBundle(projectRoot, "in-progress", reqId, projectName);
  writeJson(path.join(projectRoot, ".autopilot-checkpoint.json"), {
    project: projectName,
    reqId,
    seedText: "Resume pipeline",
    flow: "SOFTWARE_FEATURE",
    domain: "software",
    lastCompleted: "start",
    updatedAt: new Date().toISOString()
  });

  const result = runCli(
    workspaceRoot,
    projectName,
    ["--non-interactive", "--from-step", "test", "hello", "Resume pipeline"],
    ""
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Resuming autopilot from step: test/i);
  assert.match(result.stdout, /Autopilot completed successfully/i);
  assert.equal(fs.existsSync(path.join(projectRoot, ".autopilot-checkpoint.json")), false);
  assert.equal(fs.existsSync(path.join(projectRoot, "requirements", "done", reqId)), true);
});
