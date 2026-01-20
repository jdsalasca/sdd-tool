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

program
  .command("route")
  .description("Classify intent and select a flow")
  .argument("<input...>", "Input text to classify")
  .action((input: string[]) => runRoute(input.join(" ").trim()));

program
  .command("doctor")
  .description("Validate workspace artifacts and schemas")
  .action(() => runDoctor());

program.parse(process.argv);
