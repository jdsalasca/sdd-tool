import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { AIProvider, ProviderResult } from "./types";

export type GeminiResult = ProviderResult;

function parseTimeoutMs(envName: string, fallback: number): number {
  const raw = Number.parseInt(process.env[envName] ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }
  return raw;
}

function resolveCommand(input: string): string {
  if (process.platform !== "win32") {
    return input;
  }
  const looksLikePath = input.includes("\\") || input.includes("/");
  const hasExt = /\.[A-Za-z0-9]+$/.test(input);
  if (!looksLikePath && !hasExt) {
    return `${input}.cmd`;
  }
  return input;
}

type GeminiRunner = {
  command: string;
  prefixArgs: string[];
  useShell: boolean;
};

function resolveGeminiRunner(): GeminiRunner {
  const command = resolveCommand(process.env.SDD_GEMINI_BIN?.trim() || "gemini");
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  if (process.platform !== "win32" || !useShell) {
    return { command, prefixArgs: [], useShell };
  }

  const explicitNode = process.env.SDD_GEMINI_NODE?.trim();
  const nodeCommand = explicitNode && explicitNode.length > 0 ? explicitNode : process.execPath;
  const normalizedCommand = command.replace(/"/g, "").trim();
  const cmdDir = path.dirname(normalizedCommand);
  const directScript = path.resolve(cmdDir, "node_modules", "@google", "gemini-cli", "dist", "index.js");
  if (fs.existsSync(directScript)) {
    return {
      command: nodeCommand,
      prefixArgs: [directScript],
      useShell: false
    };
  }

  return { command, prefixArgs: [], useShell: true };
}

export function geminiVersion(): GeminiResult {
  const runner = resolveGeminiRunner();
  const timeout = parseTimeoutMs("SDD_AI_VERSION_TIMEOUT_MS", 15000);
  const result = spawnSync(runner.command, [...runner.prefixArgs, "--version"], {
    encoding: "utf-8",
    shell: runner.useShell,
    timeout
  });
  if (result.status !== 0) {
    return { ok: false, output: "", error: result.error?.message || result.stderr || "gemini not available" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export function geminiExec(prompt: string): GeminiResult {
  const runner = resolveGeminiRunner();
  const model = process.env.SDD_GEMINI_MODEL?.trim();
  const normalizedPrompt = prompt.replace(/\r?\n/g, "\\n");
  const env = {
    ...process.env,
    NO_COLOR: "1"
  };
  const timeout = parseTimeoutMs("SDD_AI_EXEC_TIMEOUT_MS", 180000);
  const modelArgs = model ? ["-m", model] : [];
  const buildArgs = (withModel: boolean, withOutput: boolean): string[] => {
    const args: string[] = [...runner.prefixArgs];
    if (withModel) {
      args.push(...modelArgs);
    }
    args.push("--prompt", normalizedPrompt);
    if (withOutput) {
      args.push("--output-format", "json");
    }
    return args;
  };
  const runPrimary = (withModel: boolean) =>
    runner.useShell
      ? spawnSync(
          `${runner.command} ${withModel && model ? `-m "${model.replace(/"/g, "\"\"")}" ` : ""}--prompt "${normalizedPrompt.replace(/"/g, "\"\"")}" --output-format json`,
          {
            encoding: "utf-8",
            shell: true,
            env,
            timeout
          }
        )
      : spawnSync(runner.command, buildArgs(withModel, true), {
          encoding: "utf-8",
          shell: false,
          env,
          timeout
        });
  const runFallback = (withModel: boolean) =>
    runner.useShell
      ? spawnSync(
          `${runner.command} ${withModel && model ? `-m "${model.replace(/"/g, "\"\"")}" ` : ""}--prompt "${normalizedPrompt.replace(/"/g, "\"\"")}"`,
          {
            encoding: "utf-8",
            shell: true,
            env,
            timeout
          }
        )
      : spawnSync(runner.command, buildArgs(withModel, false), {
          encoding: "utf-8",
          shell: false,
          env,
          timeout
        });
  let result = runPrimary(true);
  if (result.status !== 0 && model) {
    result = runPrimary(false);
  }
  if (result.status !== 0) {
    result = runFallback(true);
  }
  if (result.status !== 0 && model) {
    result = runFallback(false);
  }
  if (result.status !== 0) {
    return { ok: false, output: result.stdout || "", error: result.error?.message || result.stderr || "gemini exec failed" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export const geminiProvider: AIProvider = {
  id: "gemini",
  label: "Gemini",
  version: geminiVersion,
  exec: geminiExec
};
