import { ask } from "../ui/prompt";
import { printError } from "../errors";
import { getFlags } from "../context/flags";
import { resolveProvider } from "../providers";

export async function runAiExec(promptArg?: string): Promise<void> {
  const prompt = promptArg || (await ask("Prompt: "));
  if (!prompt) {
    printError("SDD-1501", "Prompt is required.");
    return;
  }
  const requested = getFlags().provider ?? "gemini";
  const resolution = resolveProvider(requested);
  if (!resolution.ok) {
    if (resolution.reason === "invalid") {
      printError("SDD-1506", `Invalid provider '${requested}'. ${resolution.details}`);
      return;
    }
    printError("SDD-1504", resolution.details);
    return;
  }
  const result = resolution.provider.exec(prompt);
  if (!result.ok) {
    printError("SDD-1505", `${resolution.provider.label} error: ${result.error}`);
    return;
  }
  console.log(result.output);
}
