import { spawnSync } from "child_process";

export type CodexResult = {
  ok: boolean;
  output: string;
  error?: string;
};

export function codexVersion(): CodexResult {
  const result = spawnSync("codex", ["--version"], { encoding: "utf-8" });
  if (result.status !== 0) {
    return { ok: false, output: "", error: result.stderr || "codex not available" };
  }
  return { ok: true, output: result.stdout.trim() };
}

export function codexExec(prompt: string): CodexResult {
  const result = spawnSync("codex", ["exec", prompt], { encoding: "utf-8" });
  if (result.status !== 0) {
    return { ok: false, output: result.stdout || "", error: result.stderr || "codex exec failed" };
  }
  return { ok: true, output: result.stdout.trim() };
}
