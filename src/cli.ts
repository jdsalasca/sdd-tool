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
import { runSuite } from "./commands/suite";
import { runImportIssue } from "./commands/import-issue";
import { runImportJira } from "./commands/import-jira";
import { runImportLinear } from "./commands/import-linear";
import { runImportAzure } from "./commands/import-azure";
import { getRepoRoot } from "./paths";
import { setFlags } from "./context/flags";
import { closePrompt } from "./ui/prompt";
import { recordCommandMetric } from "./telemetry/local-metrics";
import { defaultProviderPreference } from "./providers";
import { configPath, ensureConfig, updateConfigValue } from "./config";

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
  .option("--metrics-local", "Enable local opt-in telemetry snapshots in workspace/metrics")
  .option("--provider <name>", "AI provider: gemini|codex|auto", defaultProviderPreference())
  .option("--model <name>", "AI model id (for providers that support model override)")
  .option("--iterations <n>", "Autopilot improvement iterations (1-10)", "2")
  .option("--max-runtime-minutes <n>", "Maximum hello/suite runtime budget in minutes (1-720)")
  .option("--gemini", "Shortcut for --provider gemini");

program.hook("preAction", (thisCommand, actionCommand) => {
  const config = ensureConfig();
  const opts =
    typeof actionCommand.optsWithGlobals === "function" ? actionCommand.optsWithGlobals() : thisCommand.opts();
  const defaultMode = config.mode.default;
  const nonInteractive = Boolean(opts.nonInteractive) || defaultMode === "non-interactive";
  const beginner = Boolean(opts.beginner) || defaultMode === "beginner";
  setFlags({
    approve: Boolean(opts.approve),
    improve: Boolean(opts.improve),
    parallel: Boolean(opts.parallel),
    nonInteractive,
    dryRun: Boolean(opts.dryRun),
    beginner,
    fromStep: typeof opts.fromStep === "string" ? opts.fromStep : undefined,
    project: typeof opts.project === "string" ? opts.project : undefined,
    output: typeof opts.output === "string" ? opts.output : undefined,
    scope: typeof opts.scope === "string" ? opts.scope : undefined,
    metricsLocal: Boolean(opts.metricsLocal),
    provider: Boolean(opts.gemini)
      ? "gemini"
      : typeof opts.provider === "string"
        ? opts.provider
        : config.ai.preferred_cli,
    model: typeof opts.model === "string" ? opts.model : config.ai.model
    ,
    iterations: Number.parseInt(typeof opts.iterations === "string" ? opts.iterations : "2", 10),
    maxRuntimeMinutes:
      typeof opts.maxRuntimeMinutes === "string" ? Number.parseInt(opts.maxRuntimeMinutes, 10) : undefined
  });
  process.env.SDD_GEMINI_MODEL = typeof opts.model === "string" ? opts.model : config.ai.model;

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
  .command("suite")
  .description("Run continuous SDD orchestration mode (asks only blocking decisions)")
  .argument("[input...]", "Optional initial goal")
  .option("--campaign-hours <n>", "Minimum campaign runtime in hours before suite can stop (0-24)", "0")
  .option("--campaign-max-cycles <n>", "Maximum campaign cycles before stopping", "24")
  .option("--campaign-sleep-seconds <n>", "Sleep interval between campaign cycles", "5")
  .option("--campaign-stall-cycles <n>", "Consecutive stalled cycles before forcing fresh create recovery", "2")
  .option("--campaign-autonomous", "Force autonomous campaign mode (non-interactive + publish + release + runtime)")
  .option(
    "--campaign-target-stage <stage>",
    "Delivery stage required for campaign success: discovery|functional_requirements|technical_backlog|implementation|quality_validation|role_review|release_candidate|final_release|runtime_start",
    "runtime_start"
  )
  .action((input: string[], options) =>
    runSuite(input.join(" ").trim(), {
      campaignHours: options.campaignHours,
      campaignMaxCycles: options.campaignMaxCycles,
      campaignSleepSeconds: options.campaignSleepSeconds,
      campaignTargetStage: options.campaignTargetStage,
      campaignStallCycles: options.campaignStallCycles,
      campaignAutonomous: Boolean(options.campaignAutonomous)
    })
  );

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

const configCmd = program.command("config").description("Configuration commands");
configCmd
  .command("show")
  .description("Show effective config and config file path")
  .action(() => {
    const config = ensureConfig();
    console.log(`Config file: ${configPath()}`);
    console.log(JSON.stringify(config, null, 2));
  });

configCmd
  .command("init")
  .description("Create config file with defaults if missing")
  .action(() => {
    const config = ensureConfig();
    console.log(`Config ready: ${configPath()}`);
    console.log(`Workspace default root: ${config.workspace.default_root}`);
  });

configCmd
  .command("set")
  .description("Set config value by key")
  .argument("<key>", "Key: workspace.default_root | ai.preferred_cli | ai.model | mode.default | git.publish_enabled")
  .argument("<value>", "Value for key")
  .action((key: string, value: string) => {
    const updated = updateConfigValue(key, value);
    if (!updated) {
      console.log(
        "[SDD-1506] Invalid config key. Use workspace.default_root, ai.preferred_cli, ai.model, mode.default, git.publish_enabled, git.release_management_enabled, git.run_after_finalize."
      );
      return;
    }
    console.log(`Config updated: ${configPath()}`);
    console.log(JSON.stringify(updated, null, 2));
  });

const ai = program.command("ai").description("AI provider commands");
ai
  .command("status")
  .description("Check AI provider CLI availability")
  .action(async () => {
    const { runAiStatus } = await import("./commands/ai-status");
    runAiStatus();
  });
ai
  .command("exec")
  .description("Run configured AI provider non-interactively")
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

importCmd
  .command("linear")
  .description("Import a Linear ticket and bootstrap autopilot")
  .argument("<ticket>", "Linear ticket key or issue URL")
  .action(async (ticket: string) => {
    await runImportLinear(ticket);
  });

importCmd
  .command("azure")
  .description("Import an Azure Boards work item and bootstrap autopilot")
  .argument("<work-item>", "Azure work item id, AB#id, or work item URL")
  .action(async (workItem: string) => {
    await runImportAzure(workItem);
  });

const knownTopLevel = new Set([
  "hello",
  "init",
  "quickstart",
  "suite",
  "list",
  "status",
  "scope",
  "req",
  "pr",
  "test",
  "gen",
  "learn",
  "route",
  "doctor",
  "config",
  "ai",
  "import"
]);

function normalizeArgv(argv: string[]): string[] {
  const passthrough = argv.slice(0, 2);
  const args = argv.slice(2);
  if (args.length === 0) {
    return argv;
  }
  const valueFlags = new Set(["--from-step", "--project", "--output", "--scope", "--provider", "--model", "--iterations", "--max-runtime-minutes"]);
  let positionalIndex = -1;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("-")) {
      positionalIndex = i;
      break;
    }
    if (valueFlags.has(token)) {
      i += 1;
    }
  }
  if (positionalIndex < 0) {
    return argv;
  }
  const firstPositional = args[positionalIndex];
  if (knownTopLevel.has(firstPositional)) {
    return argv;
  }
  // Supports one-command UX: sdd-tool "create a calculator"
  return [...passthrough, ...args.slice(0, positionalIndex), "hello", ...args.slice(positionalIndex)];
}

program.parse(normalizeArgv(process.argv));

