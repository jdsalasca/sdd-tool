import { execSync, spawnSync } from "child_process";
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

function parseMaxAttempts(): number {
  const raw = Number.parseInt(process.env.SDD_GEMINI_MAX_ATTEMPTS ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 2;
  }
  return Math.max(1, Math.min(4, raw));
}

function clampPrompt(prompt: string): string {
  const maxCharsRaw = Number.parseInt(process.env.SDD_GEMINI_PROMPT_MAX_CHARS ?? "", 10);
  const maxChars = Number.isFinite(maxCharsRaw) && maxCharsRaw > 1000 ? maxCharsRaw : 7000;
  if (prompt.length <= maxChars) {
    return prompt;
  }
  return `${prompt.slice(0, maxChars)}\n...[truncated by sdd-tool due command length limits]`;
}

function looksUnrecoverableProviderFailure(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("terminalquotaerror") ||
    lower.includes("exhausted your capacity") ||
    lower.includes("code: 429") ||
    lower.includes("429") ||
    lower.includes("la linea de comandos es demasiado larga") ||
    lower.includes("linea de comandos es demasiado larga") ||
    lower.includes("the command line is too long")
  );
}

function normalizeFailure(result: ReturnType<typeof spawnSync>, fallback: string): string {
  const chunks = [result.error?.message || "", result.stderr || "", result.stdout || ""]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return fallback;
  }
  return chunks.join("\n");
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

function resolveWindowsCommandPath(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }
  if (command.includes("\\") || command.includes("/")) {
    return command;
  }
  try {
    const raw = execSync(`where.exe ${command}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000
    });
    const first = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return first || command;
  } catch {
    return command;
  }
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
  const normalizedCommand = resolveWindowsCommandPath(command.replace(/"/g, "").trim());
  const cmdDir = path.dirname(normalizedCommand);
  const directScript = path.resolve(cmdDir, "node_modules", "@google", "gemini-cli", "dist", "index.js");
  if (fs.existsSync(directScript)) {
    return {
      command: nodeCommand,
      prefixArgs: [directScript],
      useShell: false
    };
  }

  return { command: normalizedCommand, prefixArgs: [], useShell: true };
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
  const normalizedPrompt = clampPrompt(prompt);
  const env = {
    ...process.env,
    NO_COLOR: "1"
  };
  const timeout = parseTimeoutMs("SDD_AI_EXEC_TIMEOUT_MS", 120000);
  const maxAttempts = parseMaxAttempts();
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
    spawnSync(runner.command, buildArgs(withModel, true), {
      encoding: "utf-8",
      shell: runner.useShell,
      env,
      timeout
    });
  const runFallback = (withModel: boolean) =>
    spawnSync(runner.command, buildArgs(withModel, false), {
      encoding: "utf-8",
      shell: runner.useShell,
      env,
      timeout
    });
  const attempts: Array<{ name: string; run: () => ReturnType<typeof spawnSync> }> = [
    { name: "primary_model_json", run: () => runPrimary(true) },
    { name: "primary_plain_json", run: () => runPrimary(false) },
    { name: "fallback_model_text", run: () => runFallback(true) },
    { name: "fallback_plain_text", run: () => runFallback(false) }
  ];
  let last = attempts[0].run();
  let executed = 1;
  if (last.status === 0) {
    const out = String(last.stdout || "").trim();
    if (!out) {
      return { ok: false, output: "", error: "gemini returned empty output" };
    }
    return { ok: true, output: out };
  }
  let lastError = normalizeFailure(last, "gemini exec failed");
  if (looksUnrecoverableProviderFailure(lastError)) {
    return { ok: false, output: String(last.stdout || ""), error: lastError };
  }
  for (let i = 1; i < attempts.length && executed < maxAttempts; i += 1) {
    // Skip model retries when model override is not set.
    if (!model && /model/i.test(attempts[i].name)) {
      continue;
    }
    last = attempts[i].run();
    executed += 1;
    if (last.status === 0) {
      const out = String(last.stdout || "").trim();
      if (!out) {
        return { ok: false, output: "", error: "gemini returned empty output" };
      }
      return { ok: true, output: out };
    }
    lastError = normalizeFailure(last, "gemini exec failed");
    if (looksUnrecoverableProviderFailure(lastError)) {
      return { ok: false, output: String(last.stdout || ""), error: lastError };
    }
  }
  return { ok: false, output: String(last.stdout || ""), error: lastError };
}

export const geminiProvider: AIProvider = {
  id: "gemini",
  label: "Gemini",
  version: geminiVersion,
  exec: geminiExec
};
