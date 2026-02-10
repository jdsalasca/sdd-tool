import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getFlags } from "../context/flags";
import { ensureConfig } from "../config";
import { setFlags } from "../context/flags";
import { runHello } from "./hello";
import { getProjectInfo, getWorkspaceInfo } from "../workspace";
import { clearCheckpoint, loadCheckpoint, nextStep } from "./autopilot-checkpoint";
import { DeliveryStage, loadStageSnapshot } from "./stage-machine";

type SuiteContext = {
  appType?: "web" | "desktop";
  stack?: "javascript" | "typescript";
};

type SuiteRunOptions = {
  campaignHours?: string;
  campaignMaxCycles?: string;
  campaignSleepSeconds?: string;
  campaignTargetStage?: string;
};

type CampaignPolicy = {
  minRuntimeMinutes: number;
  maxCycles: number;
  sleepSeconds: number;
  targetStage: DeliveryStage;
};

function clampInt(input: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(input)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(input)));
}

function clampFloat(input: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(input)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, input));
}

function parseTargetStage(raw?: string): DeliveryStage {
  const value = (raw ?? "").trim().toLowerCase();
  const allowed: DeliveryStage[] = [
    "discovery",
    "functional_requirements",
    "technical_backlog",
    "implementation",
    "quality_validation",
    "role_review",
    "release_candidate",
    "final_release",
    "runtime_start"
  ];
  return allowed.includes(value as DeliveryStage) ? (value as DeliveryStage) : "runtime_start";
}

function resolveCampaignPolicy(options?: SuiteRunOptions): CampaignPolicy {
  const hoursInput = options?.campaignHours ?? process.env.SDD_SUITE_CAMPAIGN_HOURS ?? "0";
  const cyclesInput = options?.campaignMaxCycles ?? process.env.SDD_SUITE_CAMPAIGN_MAX_CYCLES ?? "24";
  const sleepInput = options?.campaignSleepSeconds ?? process.env.SDD_SUITE_CAMPAIGN_SLEEP_SECONDS ?? "5";
  const stageInput = options?.campaignTargetStage ?? process.env.SDD_SUITE_CAMPAIGN_TARGET_STAGE ?? "runtime_start";

  const hours = clampFloat(Number.parseFloat(hoursInput), 0, 0, 24);
  const minRuntimeMinutes = clampInt(Math.round(hours * 60), 0, 0, 24 * 60);
  const maxCycles = clampInt(Number.parseInt(cyclesInput, 10), 24, 1, 500);
  const sleepSeconds = clampInt(Number.parseInt(sleepInput, 10), 5, 0, 300);
  const targetStage = parseTargetStage(stageInput);
  return { minRuntimeMinutes, maxCycles, sleepSeconds, targetStage };
}

function appendCampaignJournal(projectRoot: string, event: string, details?: string): void {
  try {
    fs.mkdirSync(projectRoot, { recursive: true });
    const file = path.join(projectRoot, "suite-campaign-journal.jsonl");
    const entry = {
      at: new Date().toISOString(),
      event,
      details: details ?? ""
    };
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch {
    // best effort
  }
}

function resolveProjectRoot(projectName?: string): string | null {
  if (!projectName) {
    return null;
  }
  try {
    const workspace = getWorkspaceInfo();
    const info = getProjectInfo(workspace, projectName);
    return info.root;
  } catch {
    return null;
  }
}

function requirementInProgress(projectRoot: string, reqId: string): boolean {
  const reqDir = path.join(projectRoot, "requirements", "in-progress", reqId);
  return fs.existsSync(reqDir);
}

function chooseResumeStep(projectName?: string): string | undefined {
  if (!projectName) {
    return undefined;
  }
  const projectRoot = resolveProjectRoot(projectName);
  if (!projectRoot) {
    return undefined;
  }
  const checkpoint = loadCheckpoint(projectName);
  if (!checkpoint) {
    return undefined;
  }
  const reqId = checkpoint.reqId?.trim();
  if (!reqId || !requirementInProgress(projectRoot, reqId)) {
    clearCheckpoint(projectName);
    return "create";
  }
  return nextStep(checkpoint.lastCompleted) ?? "finish";
}

function stagePassed(projectName: string | undefined, stage: DeliveryStage): boolean {
  const projectRoot = resolveProjectRoot(projectName);
  if (!projectRoot) {
    return false;
  }
  const snapshot = loadStageSnapshot(projectRoot);
  return snapshot.stages[stage] === "passed";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function runCampaign(input: string, options?: SuiteRunOptions): Promise<void> {
  const policy = resolveCampaignPolicy(options);
  const startedAt = Date.now();
  const baseFlags = getFlags();
  const baseIterations = Math.max(1, Math.min(10, baseFlags.iterations || 2));
  const qualityRetryPrompt =
    "Continue from the current project state, fix all quality failures, improve architecture/docs/tests, and only deliver production-grade changes.";
  const config = ensureConfig();

  if (policy.minRuntimeMinutes > 0) {
    console.log(
      `Suite campaign enabled: ${policy.minRuntimeMinutes} min minimum runtime, max ${policy.maxCycles} cycles, target stage ${policy.targetStage}.`
    );
  }

  let cycle = 0;
  let lastProject = baseFlags.project;
  let cycleInput = input;
  while (true) {
    cycle += 1;
    const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60000);
    const iterationsThisCycle = Math.min(10, baseIterations + Math.max(0, cycle - 1));
    const model =
      (baseFlags.provider ?? "").toLowerCase() === "gemini" && cycle >= 4 ? "gemini-2.5-flash" : baseFlags.model;

    const nextFromStep = chooseResumeStep(lastProject);

    setFlags({
      iterations: iterationsThisCycle,
      model,
      fromStep: nextFromStep,
      project: lastProject
    });
    if (model) {
      process.env.SDD_GEMINI_MODEL = model;
    }

    console.log(
      `Suite campaign cycle ${cycle}/${policy.maxCycles} | elapsed ${elapsedMinutes}m | iterations ${iterationsThisCycle}${
        nextFromStep ? ` | resume ${nextFromStep}` : ""
      }`
    );
    await runHello(cycleInput, false);
    cycleInput = `${input}. ${qualityRetryPrompt}`;
    lastProject = getFlags().project ?? lastProject;

    const targetPassed = stagePassed(lastProject, policy.targetStage);
    const qualityPassed = stagePassed(lastProject, "quality_validation");
    const releasePassed = stagePassed(lastProject, "final_release");
    const runtimePassed = stagePassed(lastProject, "runtime_start");
    const minimumRuntimeMet = policy.minRuntimeMinutes <= 0 || elapsedMinutes >= policy.minRuntimeMinutes;

    const projectRoot = resolveProjectRoot(lastProject);
    if (projectRoot) {
      appendCampaignJournal(
        projectRoot,
        "campaign.cycle.completed",
        `cycle=${cycle}; elapsedMin=${elapsedMinutes}; quality=${qualityPassed}; release=${releasePassed}; runtime=${runtimePassed}; target=${policy.targetStage}; targetPassed=${targetPassed}`
      );
    }

    const runtimeRequired = config.git.run_after_finalize;
    const deliveryAccepted =
      qualityPassed && releasePassed && targetPassed && (!runtimeRequired || runtimePassed || policy.targetStage !== "runtime_start");

    if (deliveryAccepted && minimumRuntimeMet) {
      console.log(`Suite campaign completed with production gates passed on cycle ${cycle}.`);
      return;
    }
    if (cycle >= policy.maxCycles) {
      console.log("Suite campaign reached max cycles before reaching all configured quality/runtime goals.");
      return;
    }
    if (policy.sleepSeconds > 0) {
      await sleep(policy.sleepSeconds * 1000);
    }
  }
}

export async function runSuite(initialInput?: string, options?: SuiteRunOptions): Promise<void> {
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
    await runCampaign(enriched, options);
    console.log("Suite task completed. Enter next instruction or 'exit'.");
    current = "";
  }
}

export const __internal = {
  resolveCampaignPolicy,
  parseTargetStage,
  chooseResumeStep
};
