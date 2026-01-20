import { classifyIntent } from "../router/intent";
import { loadFlow } from "../router/flow";

export function runRoute(input: string): void {
  const intent = classifyIntent(input);
  const flow = loadFlow(intent.flow);
  console.log(JSON.stringify(intent, null, 2));
  if (flow) {
    console.log("\n--- Flow script ---\n");
    console.log(flow);
  } else {
    console.log("\nNo flow script found.");
  }
}
