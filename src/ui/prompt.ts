import fs from "fs";
import readline from "readline";
import { getFlags } from "../context/flags";

let queuedAnswers: string[] | null = null;
let rl: readline.Interface | null = null;

function shouldUseQueuedAnswers(): boolean {
  const flags = getFlags();
  if (flags.nonInteractive || process.env.SDD_NON_INTERACTIVE === "1") {
    return true;
  }
  if (process.env.SDD_STDIN === "1") {
    return true;
  }
  return !process.stdin.isTTY && !process.stdout.isTTY;
}

function getQueuedAnswers(): string[] {
  if (queuedAnswers) {
    return queuedAnswers;
  }
  if (shouldUseQueuedAnswers()) {
    try {
      const raw = fs.readFileSync(0, "utf-8");
      queuedAnswers = raw.split(/\r?\n/).filter((line) => line.length > 0);
      return queuedAnswers;
    } catch {
      queuedAnswers = [];
      return queuedAnswers;
    }
  }
  queuedAnswers = [];
  return queuedAnswers;
}

function getInterface(): readline.Interface {
  if (rl) {
    return rl;
  }
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return rl;
}

export function closePrompt(): void {
  if (!rl) {
    return;
  }
  rl.close();
  rl = null;
}

process.on("exit", () => closePrompt());

export function ask(question: string): Promise<string> {
  const flags = getFlags();
  if (flags.nonInteractive || process.env.SDD_NON_INTERACTIVE === "1") {
    return Promise.resolve("");
  }
  if (shouldUseQueuedAnswers()) {
    const queue = getQueuedAnswers();
    const answer = queue.shift() ?? "";
    return Promise.resolve(answer.trim());
  }
  return new Promise((resolve) => {
    const prompt = getInterface();
    prompt.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function askProjectName(prompt = "Project name: "): Promise<string> {
  const flags = getFlags();
  if (flags.project && flags.project.trim().length > 0) {
    return flags.project.trim();
  }
  return ask(prompt);
}

export async function confirm(question: string): Promise<boolean> {
  const flags = getFlags();
  if (flags.approve || flags.nonInteractive || process.env.SDD_NON_INTERACTIVE === "1") {
    return true;
  }
  const response = await ask(question);
  const normalized = response.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}
