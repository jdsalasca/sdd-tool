import fs from "fs";
import readline from "readline";
import { getFlags } from "../context/flags";

let queuedAnswers: string[] | null = null;
let rl: readline.Interface | null = null;

function getQueuedAnswers(): string[] {
  if (queuedAnswers) {
    return queuedAnswers;
  }
  if (!process.stdin.isTTY) {
    const raw = fs.readFileSync(0, "utf-8");
    queuedAnswers = raw.split(/\r?\n/).filter((line) => line.length > 0);
    return queuedAnswers;
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
  if (!process.stdin.isTTY) {
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
  if (flags.approve) {
    return true;
  }
  const response = await ask(question);
  const normalized = response.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}
