import { codexExec } from "../providers/codex";
import { ask } from "../ui/prompt";
import { printError } from "../errors";

export async function runAiExec(promptArg?: string): Promise<void> {
  const prompt = promptArg || (await ask("Prompt: "));
  if (!prompt) {
    printError("SDD-1501", "Prompt is required.");
    return;
  }
  const result = codexExec(prompt);
  if (!result.ok) {
    printError("SDD-1502", `Codex error: ${result.error}`);
    return;
  }
  console.log(result.output);
}
