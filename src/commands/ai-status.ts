import { codexVersion } from "../providers/codex";
import { printError } from "../errors";

export function runAiStatus(): void {
  const result = codexVersion();
  if (!result.ok) {
    printError("SDD-1503", `Codex not available: ${result.error}`);
    return;
  }
  console.log(`Codex available: ${result.output}`);
}
