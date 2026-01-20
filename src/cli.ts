#!/usr/bin/env node
import { Command } from "commander";
import { runHello } from "./commands/hello";
import { runInit } from "./commands/init";
import { runRoute } from "./commands/route";
import { runDoctor } from "./commands/doctor";

const program = new Command();

program
  .name("sdd-tool")
  .description("SDD-first, AI-native CLI")
  .version("0.1.0");

program
  .command("hello")
  .description("Start an interactive session and route intent")
  .argument("[input...]", "Optional input to classify")
  .action((input: string[]) => runHello(input.join(" ").trim()));

program
  .command("init")
  .description("Initialize workspace and config")
  .action(() => runInit());

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
  .action(async () => {
    const { runReqList } = await import("./commands/req-list");
    await runReqList();
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

program.parse(process.argv);
