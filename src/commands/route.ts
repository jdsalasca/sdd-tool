import { classifyIntent, FLOW_PROMPT_PACKS } from "../router/intent";
import { loadFlow } from "../router/flow";
import { getPromptPackById, loadPromptPacks, PromptPack } from "../router/prompt-packs";
import { printError } from "../errors";
import { RouterIntent } from "../types";

export function runRoute(input: string): void {
  const text = input.trim();
  if (!text) {
    printError("SDD-1423", "Route input is required.");
    return;
  }

  let intent: RouterIntent;
  let flow: string | null;
  let packs: PromptPack[];
  try {
    intent = classifyIntent(text);
    flow = loadFlow(intent.flow);
    packs = loadPromptPacks();
  } catch (error) {
    printError("SDD-1424", `Unable to load route context: ${(error as Error).message}`);
    return;
  }
  const packIds = FLOW_PROMPT_PACKS[intent.flow] ?? [];
  console.log(JSON.stringify(intent, null, 2));
  if (flow) {
    console.log("\n--- Flow script ---\n");
    console.log(flow);
  } else {
    printError("SDD-1425", `No flow script found for ${intent.flow}.`);
  }

  if (packIds.length > 0) {
    console.log("\n--- Prompt packs ---\n");
    for (const packId of packIds) {
      const pack = getPromptPackById(packs, packId);
      if (!pack) continue;
      console.log(`Pack: ${pack.id}`);
      pack.questions.forEach((question) => console.log(`- ${question}`));
    }
  }
}
