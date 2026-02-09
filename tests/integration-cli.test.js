const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawnSync, spawn } = require("node:child_process");

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

function runCli(workspaceRoot, projectName, args, input, extraEnv = {}) {
  const cliPath = path.join(__dirname, "..", "dist", "cli.js");
  const baseArgs = [cliPath, "--output", workspaceRoot];
  if (projectName && projectName.trim().length > 0) {
    baseArgs.push("--project", projectName);
  }
  return spawnSync(process.execPath, [...baseArgs, ...args], {
    input,
    encoding: "utf-8",
    env: { ...process.env, SDD_STDIN: "1", SDD_DISABLE_AI_AUTOPILOT: "1", SDD_DISABLE_APP_LIFECYCLE: "1", ...extraEnv }
  });
}

function runCliAsync(workspaceRoot, projectName, args, input, extraEnv = {}) {
  const cliPath = path.join(__dirname, "..", "dist", "cli.js");
  const baseArgs = [cliPath, "--output", workspaceRoot];
  if (projectName && projectName.trim().length > 0) {
    baseArgs.push("--project", projectName);
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...baseArgs, ...args], {
      env: { ...process.env, SDD_STDIN: "1", SDD_DISABLE_AI_AUTOPILOT: "1", SDD_DISABLE_APP_LIFECYCLE: "1", ...extraEnv }
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    if (input && input.length > 0) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.on("close", (code) => {
      resolve({ status: code, stdout, stderr });
    });
  });
}

function writeFakeCommand(binDir, name, body) {
  const winBody = typeof body === "string" ? body : body.win;
  const shBody = typeof body === "string" ? body : body.sh;
  fs.mkdirSync(binDir, { recursive: true });
  if (process.platform === "win32") {
    const cmdPath = path.join(binDir, `${name}.cmd`);
    fs.writeFileSync(cmdPath, `@echo off\r\n${winBody}\r\n`, "utf-8");
    return cmdPath;
  }
  const scriptPath = path.join(binDir, name);
  fs.writeFileSync(scriptPath, `#!/usr/bin/env sh\n${shBody}\n`, "utf-8");
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
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
  assert.match(result.stdout, /Absent files: 0/);
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

test("direct commandless input routes to hello autopilot", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-direct-entry-"));
  const result = runCli(workspaceRoot, "", ["Create a calculator app"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Hello from sdd-cli/i);
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

test("hello prints recovery command when resume checkpoint is missing", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-resume-missing-"));
  const projectName = "MissingCheckpointProject";
  const result = runCli(
    workspaceRoot,
    projectName,
    ["--non-interactive", "--from-step", "test", "hello", "resume the pipeline"],
    ""
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1004\]/i);
  assert.match(result.stdout, /No checkpoint found for resume/i);
  assert.match(result.stdout, /Next command: sdd-cli --project "MissingCheckpointProject" --from-step create hello "resume the pipeline"/i);
});

test("hello dry-run previews autopilot without creating project artifacts", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-dry-run-"));
  const result = runCli(
    workspaceRoot,
    "",
    ["--non-interactive", "--dry-run", "hello", "Build a guided onboarding assistant"],
    ""
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Dry run active: previewing autopilot plan/i);
  assert.match(result.stdout, /Would run step: create/i);
  assert.match(result.stdout, /Would run step: finish/i);
  assert.doesNotMatch(result.stdout, /Autopilot completed successfully/i);

  const entries = fs.readdirSync(workspaceRoot);
  assert.equal(entries.includes("workspaces.json"), true);
  assert.equal(entries.some((entry) => entry.startsWith("autopilot-")), false);
});

test("quickstart runs autopilot with built-in example prompts", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-quickstart-"));
  const result = runCli(workspaceRoot, "", ["quickstart", "--example", "bugfix"], "");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Running quickstart example: bugfix/i);
  assert.match(result.stdout, /Autopilot completed successfully/i);
});

test("quickstart emits SDD error code for invalid example", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-quickstart-invalid-"));
  const result = runCli(workspaceRoot, "", ["quickstart", "--example", "unknown"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1011\]/i);
});

test("hello beginner mode prints extra guidance", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-beginner-"));
  const result = runCli(
    workspaceRoot,
    "",
    ["--non-interactive", "--beginner", "hello", "Build a beginner onboarding helper"],
    ""
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[Beginner\]/i);
  assert.match(result.stdout, /Autopilot completed successfully/i);
});

test("status --next recommends requirement progression command", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-status-next-"));
  const projectName = "StatusProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  const reqId = "REQ-STATUS";
  createSpecBundle(projectRoot, "backlog", reqId, projectName);

  const result = runCli(workspaceRoot, projectName, ["status", "--next"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Project: StatusProject/i);
  assert.match(result.stdout, /- backlog: 1/i);
  assert.match(result.stdout, /Next command: sdd-cli --project "StatusProject" req plan/i);
});

test("status --next recommends quickstart when no projects exist", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-status-empty-"));
  const result = runCli(workspaceRoot, "", ["status", "--next"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No projects found/i);
  assert.match(result.stdout, /Next command: sdd-cli quickstart --example saas/i);
});

test("import issue bootstraps hello flow from GitHub issue URL", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-import-issue-"));
  const server = http.createServer((req, res) => {
    if (req.url === "/repos/octo/demo/issues/123") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          title: "Login fails on mobile Safari",
          body: "Users report login errors after entering valid credentials.",
          html_url: "https://github.com/octo/demo/issues/123"
        })
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const apiBase = `http://127.0.0.1:${port}`;

  const result = await runCliAsync(
    workspaceRoot,
    "",
    ["--non-interactive", "import", "issue", "https://github.com/octo/demo/issues/123"],
    "",
    { SDD_GITHUB_API_BASE: apiBase }
  );

  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Importing issue octo\/demo#123/i);
  assert.match(result.stdout, /Imported: Login fails on mobile Safari/i);
  assert.match(result.stdout, /Autopilot completed successfully/i);
});

test("import jira bootstraps hello flow from Jira ticket", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-import-jira-"));
  const server = http.createServer((req, res) => {
    if (req.url === "/rest/api/3/issue/PROJ-77") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          key: "PROJ-77",
          fields: {
            summary: "Checkout confirmation email missing",
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "After payment, users do not receive a confirmation email."
                    }
                  ]
                }
              ]
            }
          }
        })
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const apiBase = `http://127.0.0.1:${port}/rest/api/3`;

  const result = await runCliAsync(
    workspaceRoot,
    "",
    ["--non-interactive", "import", "jira", "PROJ-77"],
    "",
    { SDD_JIRA_API_BASE: apiBase }
  );

  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Importing Jira ticket PROJ-77/i);
  assert.match(result.stdout, /Imported: Checkout confirmation email missing/i);
  assert.match(result.stdout, /Autopilot completed successfully/i);
});

test("import linear bootstraps hello flow from Linear ticket", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-import-linear-"));
  const server = http.createServer((req, res) => {
    if (req.url === "/graphql" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf-8");
      });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}");
        if (parsed?.variables?.identifier === "LIN-77") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              data: {
                issue: {
                  identifier: "LIN-77",
                  title: "Checkout button misaligned",
                  description: "Users report the checkout button overlaps on small screens.",
                  url: "https://linear.app/acme/issue/LIN-77/checkout-button-misaligned"
                }
              }
            })
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: { issue: null } }));
      });
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const apiBase = `http://127.0.0.1:${port}/graphql`;

  const result = await runCliAsync(
    workspaceRoot,
    "",
    ["--non-interactive", "import", "linear", "LIN-77"],
    "",
    { SDD_LINEAR_API_BASE: apiBase }
  );

  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Importing Linear ticket LIN-77/i);
  assert.match(result.stdout, /Imported: Checkout button misaligned/i);
  assert.match(result.stdout, /Autopilot completed successfully/i);
});

test("import linear reports machine-readable error code for invalid ticket", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-import-linear-invalid-"));
  const result = runCli(workspaceRoot, "", ["import", "linear", "invalid-ticket"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1121\]/i);
});

test("import azure bootstraps hello flow from Azure Boards work item", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-import-azure-"));
  const server = http.createServer((req, res) => {
    if (req.url === "/_apis/wit/workitems/1234?api-version=7.1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: 1234,
          fields: {
            "System.Title": "Payment retry duplicates invoice",
            "System.Description":
              "<div>Customers are occasionally charged twice when retrying a failed payment.</div>"
          },
          _links: {
            html: {
              href: "https://dev.azure.com/acme/shop/_workitems/edit/1234"
            }
          }
        })
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const apiBase = `http://127.0.0.1:${port}/_apis/wit`;

  const result = await runCliAsync(
    workspaceRoot,
    "",
    ["--non-interactive", "import", "azure", "AB#1234"],
    "",
    { SDD_AZURE_API_BASE: apiBase }
  );

  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Importing Azure work item 1234/i);
  assert.match(result.stdout, /Imported: Payment retry duplicates invoice/i);
  assert.match(result.stdout, /Autopilot completed successfully/i);
});

test("import azure reports machine-readable error code for invalid work item", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-import-azure-invalid-"));
  const result = runCli(workspaceRoot, "", ["import", "azure", "invalid-ticket"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1131\]/i);
});

test("pr bridge links PR review artifacts into requirement directory", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-pr-bridge-"));
  const projectName = "BridgeProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  const reqId = "REQ-BRIDGE";
  const prId = "PR-123";

  const requirementDir = createSpecBundle(projectRoot, "done", reqId, projectName);
  const prDir = path.join(projectRoot, "pr-reviews", prId);
  fs.mkdirSync(prDir, { recursive: true });
  fs.writeFileSync(path.join(prDir, "pr-review-summary.md"), "# Summary", "utf-8");
  fs.writeFileSync(path.join(prDir, "pr-review-report.md"), "# Report", "utf-8");

  const result = runCli(workspaceRoot, projectName, ["pr", "bridge"], `${prId}\n${reqId}\n`);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /linked to requirement/i);

  const linkedSummary = path.join(requirementDir, "pr-review", prId, "pr-review-summary.md");
  const linkedReport = path.join(requirementDir, "pr-review", prId, "pr-review-report.md");
  const linksPath = path.join(requirementDir, "pr-links.json");
  const progressLog = path.join(requirementDir, "progress-log.md");
  const changelog = path.join(requirementDir, "changelog.md");

  assert.equal(fs.existsSync(linkedSummary), true);
  assert.equal(fs.existsSync(linkedReport), true);
  assert.equal(fs.existsSync(linksPath), true);
  assert.match(fs.readFileSync(progressLog, "utf-8"), /linked PR review PR-123 into REQ-BRIDGE/i);
  assert.match(fs.readFileSync(changelog, "utf-8"), /linked PR review PR-123 into REQ-BRIDGE/i);
});

test("doctor --fix creates missing changelog and progress-log files", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-doctor-fix-"));
  const projectName = "DoctorFixProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  const reqId = "REQ-DOCTOR-FIX";
  const requirementDir = createSpecBundle(projectRoot, "backlog", reqId, projectName);

  fs.rmSync(path.join(requirementDir, "changelog.md"), { force: true });
  fs.rmSync(path.join(requirementDir, "progress-log.md"), { force: true });

  const result = runCli(workspaceRoot, "", ["doctor", "--fix", projectName, reqId], "");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-2004\] Fixed:/i);
  assert.equal(fs.existsSync(path.join(requirementDir, "changelog.md")), true);
  assert.equal(fs.existsSync(path.join(requirementDir, "progress-log.md")), true);
});

test("doctor returns SDD error code and non-zero exit when artifact schema is invalid", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-doctor-invalid-"));
  const projectName = "DoctorInvalidProject";
  const projectRoot = path.join(workspaceRoot, projectName);
  const reqId = "REQ-DOCTOR-INVALID";
  const requirementDir = path.join(projectRoot, "requirements", "backlog", reqId);
  fs.mkdirSync(requirementDir, { recursive: true });
  fs.writeFileSync(path.join(requirementDir, "requirement.json"), JSON.stringify({ id: reqId }, null, 2), "utf-8");

  const result = runCli(workspaceRoot, "", ["doctor", projectName, reqId], "");

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /\[SDD-2006\]/i);
  assert.match(result.stdout, /\[SDD-2007\]/i);
});

test("import issue reports machine-readable error code for invalid URL", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-import-issue-invalid-"));
  const result = runCli(workspaceRoot, "", ["import", "issue", "not-a-url"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1101\]/i);
});

test("req plan reports machine-readable error code when required input is missing", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-req-plan-missing-"));
  const result = runCli(workspaceRoot, "", ["req", "plan"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1211\]/i);
});

test("pr bridge reports machine-readable error code when PR ID is missing", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-pr-bridge-missing-prid-"));
  const result = runCli(workspaceRoot, "BridgeMissingPrIdProject", ["pr", "bridge"], "\n");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1313\]/i);
});

test("status --next includes scope prefix when --scope is set", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-status-scope-next-"));
  const projectName = "ScopedStatusProject";
  const projectRoot = path.join(workspaceRoot, "payments", projectName);
  const reqId = "REQ-SCOPE-STATUS";
  createSpecBundle(projectRoot, "backlog", reqId, projectName);

  const result = runCli(workspaceRoot, projectName, ["--scope", "payments", "status", "--next"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Scope: payments/i);
  assert.match(result.stdout, /--scope "payments" --project "ScopedStatusProject" req plan/i);
});

test("scope list and scope status summarize scoped workspaces", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-scope-list-"));
  writeJson(path.join(workspaceRoot, "payments", "workspaces.json"), {
    projects: [{ name: "PayA", status: "backlog" }, { name: "PayB", status: "done" }]
  });
  writeJson(path.join(workspaceRoot, "core", "workspaces.json"), {
    projects: [{ name: "CoreA", status: "wip" }]
  });

  const listResult = runCli(workspaceRoot, "", ["scope", "list"], "");
  assert.equal(listResult.status, 0);
  assert.match(listResult.stdout, /payments/i);
  assert.match(listResult.stdout, /core/i);

  const statusResult = runCli(workspaceRoot, "", ["scope", "status", "payments"], "");
  assert.equal(statusResult.status, 0);
  assert.match(statusResult.stdout, /Scope: payments/i);
  assert.match(statusResult.stdout, /Projects: 2/i);
  assert.match(statusResult.stdout, /- backlog: 1/i);
  assert.match(statusResult.stdout, /- done: 1/i);
});

test("scope status emits SDD error code when scope is missing", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-scope-status-missing-"));
  const result = runCli(workspaceRoot, "", ["scope", "status"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1411\]/i);
});

test("scope list emits SDD error code when no scopes exist", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-scope-list-empty-"));
  const result = runCli(workspaceRoot, "", ["scope", "list"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1412\]/i);
});

test("status emits SDD error code when selected project directory does not exist", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-status-missing-project-root-"));
  const result = runCli(workspaceRoot, "GhostProject", ["status"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1402\]/i);
});

test("list emits SDD error code when prompt packs cannot be loaded", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-list-missing-packs-"));
  const fakeRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-repo-missing-packs-"));
  const result = runCli(workspaceRoot, "", ["list"], "", { SDD_REPO_ROOT: fakeRepoRoot });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1421\]/i);
});

test("route emits SDD error code when route context cannot be loaded", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-route-missing-context-"));
  const fakeRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-repo-missing-context-"));
  const result = runCli(workspaceRoot, "", ["route", "build api"], "", { SDD_REPO_ROOT: fakeRepoRoot });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1424\]/i);
});

test("hello emits SDD error code for invalid --from-step value", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-invalid-from-step-"));
  const result = runCli(workspaceRoot, "InvalidStepProject", ["--non-interactive", "--from-step", "invalid", "hello", "resume pipeline"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1003\]/i);
});

test("hello emits SDD error code for invalid --iterations value", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-invalid-iterations-"));
  const result = runCli(workspaceRoot, "InvalidIterationsProject", ["--non-interactive", "--iterations", "11", "hello", "build app"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1005\]/i);
});

test("hello emits SDD error code for invalid --max-runtime-minutes value", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-invalid-runtime-"));
  const result = runCli(
    workspaceRoot,
    "InvalidRuntimeProject",
    ["--non-interactive", "--max-runtime-minutes", "0", "hello", "build app"],
    ""
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1006\]/i);
});

test("hello accepts --iterations within range", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-iterations-ok-"));
  const result = runCli(workspaceRoot, "", ["--non-interactive", "--iterations", "2", "hello", "build app"], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Iterations configured: 2/i);
});

test("hello --questions emits SDD error code when prompt packs cannot be loaded", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-hello-questions-missing-packs-"));
  const fakeRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-repo-missing-packs-"));
  const result = runCli(
    workspaceRoot,
    "",
    ["hello", "--questions", "plan api rollout"],
    "y\nn\n",
    { SDD_REPO_ROOT: fakeRepoRoot }
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-1012\]/i);
});

test("hello --metrics-local writes local telemetry snapshot", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-metrics-local-"));
  const result = runCli(
    workspaceRoot,
    "",
    ["--metrics-local", "--non-interactive", "hello", "Build a telemetry-enabled onboarding flow"],
    ""
  );
  assert.equal(result.status, 0);
  const metricsPath = path.join(workspaceRoot, "metrics", "local-metrics.json");
  assert.equal(fs.existsSync(metricsPath), true);
  const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
  assert.equal(metrics.activation.started >= 1, true);
});

test("hello creates lifecycle artifacts when lifecycle is enabled", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-lifecycle-enabled-"));
  const result = runCli(
    workspaceRoot,
    "",
    ["--non-interactive", "hello", "Build a calculator app"],
    "",
    { SDD_DISABLE_APP_LIFECYCLE: "0", SDD_GEMINI_BIN: "missing-gemini-bin" }
  );
  assert.equal(result.status, 0);
  const projects = fs.readdirSync(workspaceRoot).filter((entry) => entry !== "workspaces.json");
  assert.equal(projects.length > 0, true);
  const appDir = path.join(workspaceRoot, projects[0], "generated-app");
  assert.equal(fs.existsSync(path.join(appDir, "deploy", "deployment.md")), true);
  assert.equal(fs.existsSync(path.join(appDir, "deploy", "lifecycle-report.md")), true);
});

test("ai status uses selected gemini provider when available", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-ai-status-gemini-"));
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-fake-bin-"));
  const geminiBin = writeFakeCommand(fakeBin, "gemini", {
    win: "if \"%1\"==\"--version\" (echo gemini-cli 1.2.3 & exit /b 0) else (echo unsupported & exit /b 1)",
    sh: "if [ \"$1\" = \"--version\" ]; then echo gemini-cli 1.2.3; exit 0; fi; echo unsupported; exit 1"
  });
  const result = runCli(workspaceRoot, "", ["--provider", "gemini", "ai", "status"], "", { SDD_GEMINI_BIN: geminiBin });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Provider selected: gemini/i);
  assert.match(result.stdout, /Gemini available: gemini-cli 1.2.3/i);
});

test("ai exec uses gemini provider and prints output", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-ai-exec-gemini-"));
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-fake-bin-"));
  const geminiBin = writeFakeCommand(fakeBin, "gemini", {
    win: "if \"%1\"==\"--version\" (echo gemini-cli 1.2.3 & exit /b 0) else (if \"%1\"==\"--prompt\" (echo GENERATED_FROM_GEMINI & exit /b 0) else (exit /b 1))",
    sh: "if [ \"$1\" = \"--version\" ]; then echo gemini-cli 1.2.3; exit 0; fi; if [ \"$1\" = \"--prompt\" ]; then echo GENERATED_FROM_GEMINI; exit 0; fi; exit 1"
  });
  const result = runCli(workspaceRoot, "", ["--provider", "gemini", "ai", "exec", "build", "calculator"], "", {
    SDD_GEMINI_BIN: geminiBin
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GENERATED_FROM_GEMINI/i);
});

test("pr risk builds severity rollup and unresolved summary", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-pr-risk-"));
  const projectName = "RiskProject";
  const prId = "PR-9";
  const prDir = path.join(workspaceRoot, projectName, "pr-reviews", prId, "responses");
  fs.mkdirSync(prDir, { recursive: true });
  fs.writeFileSync(
    path.join(prDir, "c1.md"),
    "# PR Response Generator\n\n- Severity: blocker\n- Decision: defer\n",
    "utf-8"
  );
  fs.writeFileSync(
    path.join(prDir, "c2.md"),
    "# PR Response Generator\n\n- Severity: high\n- Decision: accept\n",
    "utf-8"
  );

  const result = runCli(workspaceRoot, projectName, ["pr", "risk"], `${prId}\n`);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PR risk summary written/i);
  assert.equal(fs.existsSync(path.join(workspaceRoot, projectName, "pr-reviews", prId, "pr-risk-summary.json")), true);
});

test("pr bridge-check fails with machine-readable code when link integrity is broken", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-pr-bridge-check-"));
  const projectName = "BridgeCheckProject";
  const reqId = "REQ-BRIDGE-CHECK";
  const requirementDir = createSpecBundle(path.join(workspaceRoot, projectName), "done", reqId, projectName);
  writeJson(path.join(requirementDir, "pr-links.json"), [
    {
      prId: "PR-404",
      prDir: path.join(workspaceRoot, projectName, "pr-reviews", "PR-404"),
      requirementDir,
      copiedArtifacts: ["pr-review-report.md"],
      linkedAt: new Date().toISOString()
    }
  ]);

  const result = runCli(workspaceRoot, projectName, ["pr", "bridge-check"], `${reqId}\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /\[SDD-1336\]/i);
  assert.equal(fs.existsSync(path.join(requirementDir, "pr-bridge-integrity.json")), true);
});

test("doctor --fix creates requirement JSON skeletons and fix report", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-doctor-skeleton-"));
  const projectName = "DoctorSkeletonProject";
  const reqId = "REQ-SKELETON";
  const reqDir = path.join(workspaceRoot, projectName, "requirements", "wip", reqId);
  fs.mkdirSync(reqDir, { recursive: true });
  fs.writeFileSync(path.join(reqDir, "changelog.md"), "# Changelog\n\n", "utf-8");
  fs.writeFileSync(path.join(reqDir, "progress-log.md"), "# Progress Log\n\n", "utf-8");

  const result = runCli(workspaceRoot, "", ["doctor", "--fix", projectName, reqId], "");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[SDD-2008\] Fixed:/i);
  assert.equal(fs.existsSync(path.join(reqDir, "requirement.json")), true);
  assert.equal(fs.existsSync(path.join(reqDir, "functional-spec.json")), true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, projectName, "doctor-fix-report.json")), true);
});
