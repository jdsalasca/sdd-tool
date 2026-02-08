import { spawnSync } from "child_process";
import { AIProvider, ProviderResult } from "./types";

export type CodexResult = ProviderResult;

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

export function codexVersion(): CodexResult {
  const command = resolveCommand(process.env.SDD_CODEX_BIN?.trim() || "codex");
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const timeout = parseTimeoutMs("SDD_AI_VERSION_TIMEOUT_MS", 15000);
  const result = spawnSync(command, ["--version"], {
    encoding: "utf-8",
    shell: useShell,
    timeout
  });
  if (result.status !== 0) {
    return { ok: false, output: "", error: result.error?.message || result.stderr || "codex not available" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export function codexExec(prompt: string): CodexResult {
  const command = resolveCommand(process.env.SDD_CODEX_BIN?.trim() || "codex");
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const timeout = parseTimeoutMs("SDD_AI_EXEC_TIMEOUT_MS", 180000);
  const result = useShell
    ? spawnSync(`${command} exec "${prompt.replace(/"/g, "\"\"")}"`, {
        encoding: "utf-8",
        shell: true,
        timeout
      })
    : spawnSync(command, ["exec", prompt], {
        encoding: "utf-8",
        timeout
      });
  if (result.status !== 0) {
    return { ok: false, output: result.stdout || "", error: result.error?.message || result.stderr || "codex exec failed" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export const codexProvider: AIProvider = {
  id: "codex",
  label: "Codex",
  version: codexVersion,
  exec: codexExec
};
