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
  return spawnSync(process.execPath, [cliPath, "--output", workspaceRoot, "--project", projectName, ...args], {
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
