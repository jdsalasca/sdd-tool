import { spawnSync } from "child_process";
import { AIProvider, ProviderResult } from "./types";

export type CodexResult = ProviderResult;

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
  const result = spawnSync(command, ["--version"], {
    encoding: "utf-8",
    shell: useShell
  });
  if (result.status !== 0) {
    return { ok: false, output: "", error: result.stderr || "codex not available" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export function codexExec(prompt: string): CodexResult {
  const command = resolveCommand(process.env.SDD_CODEX_BIN?.trim() || "codex");
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const result = useShell
    ? spawnSync(`${command} exec "${prompt.replace(/"/g, "\"\"")}"`, {
        encoding: "utf-8",
        shell: true
      })
    : spawnSync(command, ["exec", prompt], {
        encoding: "utf-8"
      });
  if (result.status !== 0) {
    return { ok: false, output: result.stdout || "", error: result.stderr || "codex exec failed" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export const codexProvider: AIProvider = {
  id: "codex",
  label: "Codex",
  version: codexVersion,
  exec: codexExec
};
