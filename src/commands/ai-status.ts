import { codexVersion } from "../providers/codex";

export function runAiStatus(): void {
  const result = codexVersion();
  if (!result.ok) {
    console.log(`Codex not available: ${result.error}`);
    return;
  }
  console.log(`Codex available: ${result.output}`);
}
