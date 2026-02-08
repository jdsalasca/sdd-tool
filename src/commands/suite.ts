import { ask } from "../ui/prompt";
import { getFlags } from "../context/flags";
import { runHello } from "./hello";

type SuiteContext = {
  appType?: "web" | "desktop";
  stack?: "javascript" | "typescript";
};

function inferAppType(text: string): SuiteContext["appType"] | undefined {
  const lower = text.toLowerCase();
  if (/\bdesktop\b|\bwindows\b|\belectron\b/.test(lower)) {
    return "desktop";
  }
  if (/\bweb\b|\bbrowser\b|\bsite\b|\bfrontend\b/.test(lower)) {
    return "web";
  }
  return undefined;
}

function inferStack(text: string): SuiteContext["stack"] | undefined {
  const lower = text.toLowerCase();
  if (/\btypescript\b|\bts\b/.test(lower)) {
    return "typescript";
  }
  if (/\bjavascript\b|\bjs\b/.test(lower)) {
    return "javascript";
  }
  return undefined;
}

async function resolveBlockers(input: string): Promise<SuiteContext> {
  const flags = getFlags();
  const nonInteractive = flags.nonInteractive;
  const inferredType = inferAppType(input);
  const inferredStack = inferStack(input);

  let appType = inferredType;
  let stack = inferredStack;

  if (!appType) {
    if (nonInteractive) {
      appType = "web";
    } else {
      const answer = (await ask("Blocker: app type? (web/desktop) ")).trim().toLowerCase();
      appType = answer === "desktop" ? "desktop" : "web";
    }
  }
  if (!stack) {
    if (nonInteractive) {
      stack = "javascript";
    } else {
      const answer = (await ask("Blocker: stack? (javascript/typescript) ")).trim().toLowerCase();
      stack = answer === "typescript" ? "typescript" : "javascript";
    }
  }

  return { appType, stack };
}

function enrichIntent(intent: string, context: SuiteContext): string {
  return `${intent}. Build target: ${context.appType}. Preferred stack: ${context.stack}. Finish complete delivery including tests and deployment notes.`;
}

export async function runSuite(initialInput?: string): Promise<void> {
  const startedNonInteractive = getFlags().nonInteractive;
  console.log("SDD Suite started. Type 'exit' to close.");

  let current = (initialInput ?? "").trim();
  while (true) {
    if (!current) {
      if (startedNonInteractive) {
        console.log("Suite finished.");
        return;
      }
      current = (await ask("suite> ")).trim();
    }
    if (!current) {
      continue;
    }
    if (current.toLowerCase() === "exit" || current.toLowerCase() === "quit") {
      console.log("Suite finished.");
      return;
    }

    const context = await resolveBlockers(current);
    const enriched = enrichIntent(current, context);
    await runHello(enriched, false);
    console.log("Suite task completed. Enter next instruction or 'exit'.");
    current = "";
  }
}
