import fs from "fs";
import readline from "readline";
import { getFlags } from "../context/flags";

let queuedAnswers: string[] | null = null;

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

process.on("exit", () => rl.close());

export function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const queue = getQueuedAnswers();
    const answer = queue.shift() ?? "";
    return Promise.resolve(answer.trim());
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
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
