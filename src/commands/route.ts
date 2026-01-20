import { classifyIntent, FLOW_PROMPT_PACKS } from "../router/intent";
import { loadFlow } from "../router/flow";
import { getPromptPackById, loadPromptPacks } from "../router/prompt-packs";

export function runRoute(input: string): void {
  const intent = classifyIntent(input);
  const flow = loadFlow(intent.flow);
  const packs = loadPromptPacks();
  const packIds = FLOW_PROMPT_PACKS[intent.flow] ?? [];
  console.log(JSON.stringify(intent, null, 2));
  if (flow) {
    console.log("\n--- Flow script ---\n");
    console.log(flow);
  } else {
    console.log("\nNo flow script found.");
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
