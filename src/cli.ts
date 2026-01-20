#!/usr/bin/env node
import { Command } from "commander";
import { runHello } from "./commands/hello";
import { runInit } from "./commands/init";
import { runRoute } from "./commands/route";

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

program
  .command("route")
  .description("Classify intent and select a flow")
  .argument("<input...>", "Input text to classify")
  .action((input: string[]) => runRoute(input.join(" ").trim()));

program.parse(process.argv);
