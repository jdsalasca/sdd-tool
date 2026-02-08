import { spawnSync } from "child_process";
import { AIProvider, ProviderResult } from "./types";

export type GeminiResult = ProviderResult;

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

export function geminiVersion(): GeminiResult {
  const command = resolveCommand(process.env.SDD_GEMINI_BIN?.trim() || "gemini");
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const result = spawnSync(command, ["--version"], {
    encoding: "utf-8",
    shell: useShell
  });
  if (result.status !== 0) {
    return { ok: false, output: "", error: result.stderr || "gemini not available" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export function geminiExec(prompt: string): GeminiResult {
  const command = resolveCommand(process.env.SDD_GEMINI_BIN?.trim() || "gemini");
  const model = process.env.SDD_GEMINI_MODEL?.trim();
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const normalizedPrompt = prompt.replace(/\r?\n/g, "\\n");
  const env = {
    ...process.env,
    NO_COLOR: "1"
  };
  const modelArgs = model ? ["-m", model] : [];
  const runPrimary = (withModel: boolean) =>
    useShell
      ? spawnSync(
          `${command} ${withModel && model ? `-m "${model.replace(/"/g, "\"\"")}" ` : ""}--prompt "${normalizedPrompt.replace(/"/g, "\"\"")}" --output-format json`,
          {
            encoding: "utf-8",
            shell: true,
            env
          }
        )
      : spawnSync(command, [...(withModel ? modelArgs : []), "--prompt", normalizedPrompt, "--output-format", "json"], {
          encoding: "utf-8",
          shell: false,
          env
        });
  const runFallback = (withModel: boolean) =>
    useShell
      ? spawnSync(
          `${command} ${withModel && model ? `-m "${model.replace(/"/g, "\"\"")}" ` : ""}--prompt "${normalizedPrompt.replace(/"/g, "\"\"")}"`,
          {
            encoding: "utf-8",
            shell: true,
            env
          }
        )
      : spawnSync(command, [...(withModel ? modelArgs : []), "--prompt", normalizedPrompt], {
          encoding: "utf-8",
          shell: false,
          env
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
    return { ok: false, output: result.stdout || "", error: result.stderr || "gemini exec failed" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export const geminiProvider: AIProvider = {
  id: "gemini",
  label: "Gemini",
  version: geminiVersion,
  exec: geminiExec
};
