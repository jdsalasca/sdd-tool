import { setFlags } from "../context/flags";
import { runHello } from "./hello";

const QUICKSTART_EXAMPLES: Record<string, string> = {
  saas: "Build a SaaS onboarding workflow for first-time users",
  bugfix: "Fix a high-priority login failure with reproducible steps and tests",
  api: "Design a REST API for order management with validation and error handling",
  ecommerce: "Create an ecommerce checkout flow with payments and order confirmation",
  mobile: "Plan a mobile app feature for push notifications and user preferences"
};

function normalizeExample(example: string | undefined): string {
  const value = (example || "saas").trim().toLowerCase();
  return QUICKSTART_EXAMPLES[value] ? value : "saas";
}

export async function runQuickstart(example?: string, listExamples?: boolean): Promise<void> {
  if (listExamples) {
    console.log("Quickstart examples:");
    Object.entries(QUICKSTART_EXAMPLES).forEach(([key, prompt]) => {
      console.log(`- ${key}: ${prompt}`);
    });
    return;
  }

  const selected = normalizeExample(example);
  const seed = QUICKSTART_EXAMPLES[selected];
  console.log(`Running quickstart example: ${selected}`);
  setFlags({ nonInteractive: true });
  await runHello(seed, false);
}
