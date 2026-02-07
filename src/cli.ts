#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { Command } from "commander";
import { runHello } from "./commands/hello";
import { runInit } from "./commands/init";
import { runRoute } from "./commands/route";
import { runDoctor } from "./commands/doctor";
import { runQuickstart } from "./commands/quickstart";
import { runStatus } from "./commands/status";
import { runImportIssue } from "./commands/import-issue";
import { runImportJira } from "./commands/import-jira";
import { getRepoRoot } from "./paths";
import { setFlags } from "./context/flags";
import { closePrompt } from "./ui/prompt";
import { recordCommandMetric } from "./telemetry/local-metrics";

const program = new Command();

function getVersion(): string {
  try {
    const pkgPath = path.join(getRepoRoot(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

program
  .name("sdd-cli")
  .description("SDD-first, AI-native CLI")
  .version(getVersion())
  .option("--approve", "Skip confirmations if gates pass")
  .option("--improve", "Trigger self-audit and regenerate")
  .option("--parallel", "Generate in parallel when supported")
  .option("--non-interactive", "Run with defaults and without prompt confirmations")
  .option("--dry-run", "Preview autopilot steps without writing artifacts")
  .option("--beginner", "Enable extra step-by-step guidance in hello flow")
  .option("--from-step <step>", "Resume or start autopilot from step: create|plan|start|test|finish")
  .option("--project <name>", "Select or name the project")
  .option("--output <path>", "Override workspace output root")
  .option("--scope <name>", "Target a monorepo scope namespace inside the workspace")
  .option("--metrics-local", "Enable local opt-in telemetry snapshots in workspace/metrics");

program.hook("preAction", (thisCommand, actionCommand) => {
  const opts =
    typeof actionCommand.optsWithGlobals === "function" ? actionCommand.optsWithGlobals() : thisCommand.opts();
  setFlags({
    approve: Boolean(opts.approve),
    improve: Boolean(opts.improve),
    parallel: Boolean(opts.parallel),
    nonInteractive: Boolean(opts.nonInteractive),
    dryRun: Boolean(opts.dryRun),
    beginner: Boolean(opts.beginner),
    fromStep: typeof opts.fromStep === "string" ? opts.fromStep : undefined,
    project: typeof opts.project === "string" ? opts.project : undefined,
    output: typeof opts.output === "string" ? opts.output : undefined,
    scope: typeof opts.scope === "string" ? opts.scope : undefined,
    metricsLocal: Boolean(opts.metricsLocal)
  });

  const commandPath =
    typeof actionCommand.name === "function"
      ? `${thisCommand.name()} ${actionCommand.name()}`.trim()
      : thisCommand.name();
  recordCommandMetric(commandPath);
});

program.hook("postAction", () => {
  closePrompt();
});

program
  .command("hello")
  .description("Start an interactive session and route intent")
  .argument("[input...]", "Optional input to classify")
  .option("--questions", "Run prompt questions for detected intent")
  .option("--auto", "Generate a requirement draft after questions")
  .action((input: string[], options) => runHello(input.join(" ").trim(), options.questions || options.auto));

program
  .command("init")
  .description("Initialize workspace and config")
  .action(() => runInit());

program
  .command("quickstart")
  .description("Run a zero-friction autopilot demo flow")
  .option("--example <name>", "Example prompt: saas|bugfix|api|ecommerce|mobile")
  .option("--list-examples", "List available example prompts")
  .action((options) => runQuickstart(options.example, options.listExamples));

program
  .command("list")
  .description("List flows, templates, and projects")
  .action(async () => {
    const { runList } = await import("./commands/list");
    runList();
  });

program
  .command("status")
  .description("Show project requirement counts and next recommended command")
  .option("--next", "Print exact next command to run")
  .action((options) => runStatus(Boolean(options.next)));

const scopeCmd = program.command("scope").description("Monorepo scope workspace commands");
scopeCmd
  .command("list")
  .description("List known workspace scopes")
  .action(async () => {
    const { runScopeList } = await import("./commands/scope-list");
    runScopeList();
  });
scopeCmd
  .command("status")
  .description("Show project status summary for a scope")
  .argument("[scope]", "Scope name")
  .action(async (scope?: string) => {
    const { runScopeStatus } = await import("./commands/scope-status");
    runScopeStatus(scope);
  });

const req = program.command("req").description("Requirement lifecycle commands");
req
  .command("create")
  .description("Create a new requirement")
  .action(async () => {
    const { runReqCreate } = await import("./commands/req-create");
    await runReqCreate();
  });
req
  .command("plan")
  .description("Generate specs for a requirement")
  .action(async () => {
    const { runReqPlan } = await import("./commands/req-plan");
    await runReqPlan();
  });
req
  .command("refine")
  .description("Refine an existing requirement")
  .action(async () => {
    const { runReqRefine } = await import("./commands/req-refine");
    await runReqRefine();
  });
req
  .command("start")
  .description("Generate implementation plan and quality contract")
  .action(async () => {
    const { runReqStart } = await import("./commands/req-start");
    await runReqStart();
  });
req
  .command("finish")
  .description("Finalize and archive a requirement")
  .action(async () => {
    const { runReqFinish } = await import("./commands/req-finish");
    await runReqFinish();
  });
req
  .command("archive")
  .description("Archive a completed requirement")
  .action(async () => {
    const { runReqArchive } = await import("./commands/req-archive");
    await runReqArchive();
  });
req
  .command("list")
  .description("List requirements by status")
  .option("--status <status>", "Filter by status")
  .action(async (options) => {
    const { runReqList } = await import("./commands/req-list");
    await runReqList(options.status);
  });
req
  .command("status")
  .description("Show a requirement status")
  .action(async () => {
    const { runReqStatus } = await import("./commands/req-status");
    await runReqStatus();
  });
req
  .command("lint")
  .description("Validate artifacts for a requirement")
  .action(async () => {
    const { runReqLint } = await import("./commands/req-lint");
    await runReqLint();
  });
req
  .command("report")
  .description("Show completeness report for a requirement")
  .action(async () => {
    const { runReqReport } = await import("./commands/req-report");
    await runReqReport();
  });
req
  .command("export")
  .description("Export requirement artifacts to a directory")
  .action(async () => {
    const { runReqExport } = await import("./commands/req-export");
    await runReqExport();
  });

const pr = program.command("pr").description("PR review workflow commands");
pr
  .command("start")
  .description("Initialize PR review artifacts")
  .action(async () => {
    const { runPrStart } = await import("./commands/pr-start");
    await runPrStart();
  });
pr
  .command("audit")
  .description("Update PR comment audit")
  .action(async () => {
    const { runPrAudit } = await import("./commands/pr-audit");
    await runPrAudit();
  });
pr
  .command("respond")
  .description("Generate a response for a PR comment")
  .action(async () => {
    const { runPrRespond } = await import("./commands/pr-respond");
    await runPrRespond();
  });
pr
  .command("finish")
  .description("Finalize PR review summary")
  .action(async () => {
    const { runPrFinish } = await import("./commands/pr-finish");
    await runPrFinish();
  });
pr
  .command("report")
  .description("Generate PR review report")
  .action(async () => {
    const { runPrReport } = await import("./commands/pr-report");
    await runPrReport();
  });
pr
  .command("bridge")
  .description("Link PR review artifacts into a requirement")
  .action(async () => {
    const { runPrBridge } = await import("./commands/pr-bridge");
    await runPrBridge();
  });
pr
  .command("risk")
  .description("Generate PR risk severity rollup and unresolved summary")
  .action(async () => {
    const { runPrRisk } = await import("./commands/pr-risk");
    await runPrRisk();
  });
pr
  .command("bridge-check")
  .description("Validate PR bridge integrity for a requirement")
  .action(async () => {
    const { runPrBridgeCheck } = await import("./commands/pr-bridge-check");
    await runPrBridgeCheck();
  });

const test = program.command("test").description("Test planning commands");
test
  .command("plan")
  .description("Generate or update a test plan")
  .action(async () => {
    const { runTestPlan } = await import("./commands/test-plan");
    await runTestPlan();
  });

const gen = program.command("gen").description("Artifact generation commands");
gen
  .command("requirements")
  .description("Generate a requirement")
  .action(async () => {
    const { runGenRequirements } = await import("./commands/gen-requirements");
    await runGenRequirements();
  });
gen
  .command("functional-spec")
  .description("Generate a functional spec")
  .action(async () => {
    const { runGenFunctionalSpec } = await import("./commands/gen-functional-spec");
    await runGenFunctionalSpec();
  });
gen
  .command("technical-spec")
  .description("Generate a technical spec")
  .action(async () => {
    const { runGenTechnicalSpec } = await import("./commands/gen-technical-spec");
    await runGenTechnicalSpec();
  });
gen
  .command("architecture")
  .description("Generate an architecture spec")
  .action(async () => {
    const { runGenArchitecture } = await import("./commands/gen-architecture");
    await runGenArchitecture();
  });
gen
  .command("best-practices")
  .description("Generate quality contract")
  .action(async () => {
    const { runGenBestPractices } = await import("./commands/gen-best-practices");
    await runGenBestPractices();
  });
gen
  .command("project-readme")
  .description("Generate project README")
  .action(async () => {
    const { runGenProjectReadme } = await import("./commands/gen-project-readme");
    await runGenProjectReadme();
  });

const learn = program.command("learn").description("Learning mode commands");
learn
  .command("start")
  .description("Start a learning session")
  .action(async () => {
    const { runLearnStart } = await import("./commands/learn-start");
    await runLearnStart();
  });
learn
  .command("refine")
  .description("Refine a learning session")
  .action(async () => {
    const { runLearnRefine } = await import("./commands/learn-refine");
    await runLearnRefine();
  });
learn
  .command("deliver")
  .description("Deliver learning outputs")
  .action(async () => {
    const { runLearnDeliver } = await import("./commands/learn-deliver");
    await runLearnDeliver();
  });

program
  .command("route")
  .description("Classify intent and select a flow")
  .argument("<input...>", "Input text to classify")
  .action((input: string[]) => runRoute(input.join(" ").trim()));

program
  .command("doctor")
  .description("Validate workspace artifacts and schemas")
  .argument("[project]", "Optional project name to validate")
  .argument("[requirementId]", "Optional requirement ID to validate")
  .option("--fix", "Apply safe remediations (missing changelog/progress-log)")
  .action((project: string | undefined, requirementId: string | undefined, options: { fix?: boolean }) =>
    runDoctor(project, requirementId, Boolean(options.fix))
  );

const ai = program.command("ai").description("Codex provider commands");
ai
  .command("status")
  .description("Check Codex CLI availability")
  .action(async () => {
    const { runAiStatus } = await import("./commands/ai-status");
    runAiStatus();
  });
ai
  .command("exec")
  .description("Run Codex non-interactively")
  .argument("[prompt...]", "Prompt to execute")
  .action(async (prompt: string[]) => {
    const { runAiExec } = await import("./commands/ai-exec");
    await runAiExec(prompt.join(" ").trim());
  });

const importCmd = program.command("import").description("Import external work items into SDD flow");
importCmd
  .command("issue")
  .description("Import a GitHub issue URL and bootstrap autopilot")
  .argument("<url>", "GitHub issue URL")
  .action(async (url: string) => {
    await runImportIssue(url);
  });

importCmd
  .command("jira")
  .description("Import a Jira ticket and bootstrap autopilot")
  .argument("<ticket>", "Jira ticket key or browse URL")
  .action(async (ticket: string) => {
    await runImportJira(ticket);
  });

program.parse(process.argv);

