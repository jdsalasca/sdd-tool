#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { Command } from "commander";
import { runHello } from "./commands/hello";
import { runInit } from "./commands/init";
import { runRoute } from "./commands/route";
import { runDoctor } from "./commands/doctor";
import { getRepoRoot } from "./paths";

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
  .name("sdd-tool")
  .description("SDD-first, AI-native CLI")
  .version(getVersion());

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
  .command("list")
  .description("List flows, templates, and projects")
  .action(async () => {
    const { runList } = await import("./commands/list");
    runList();
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

const test = program.command("test").description("Test planning commands");
test
  .command("plan")
  .description("Generate or update a test plan")
  .action(async () => {
    const { runTestPlan } = await import("./commands/test-plan");
    await runTestPlan();
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
  .action((project?: string, requirementId?: string) => runDoctor(project, requirementId));

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

program.parse(process.argv);
