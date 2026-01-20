import { codexExec } from "../providers/codex";
import { ask } from "../ui/prompt";

export async function runAiExec(promptArg?: string): Promise<void> {
  const prompt = promptArg || (await ask("Prompt: "));
  if (!prompt) {
    console.log("Prompt is required.");
    return;
  }
  const result = codexExec(prompt);
  if (!result.ok) {
    console.log(`Codex error: ${result.error}`);
    return;
  }
  console.log(result.output);
}
