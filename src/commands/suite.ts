import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getFlags } from "../context/flags";
import { ensureConfig } from "../config";
import { setFlags } from "../context/flags";
import { runHello } from "./hello";
import { getProjectInfo, getWorkspaceInfo, pruneMissingProjects } from "../workspace";
import { clearCheckpoint, loadCheckpoint, nextStep } from "./autopilot-checkpoint";
import { DeliveryStage, loadStageSnapshot } from "./stage-machine";
import { resolveProvider } from "../providers";
import type { ModelSelectionReason } from "../providers/types";
import {
  clearExpiredModelAvailability,
  isModelUnavailable,
  listUnavailableModels,
  markModelUnavailable,
  nextAvailabilityMs
} from "../providers/model-availability-cache";
import {
  detectProviderIssueType as detectProviderIssueTypeForProject,
  readRecentQuotaResetHint as readRecentQuotaResetHintForProject,
  ProviderIssueType
} from "./suite/provider-diagnostics";
import { BlockingSignals, readBlockingSignals as readBlockingSignalsForProject } from "./suite/blocking-signals";
import {
  collectQualityFeedback as collectQualityFeedbackForProject,
  requirementQualityFeedback as requirementQualityFeedbackForProject
} from "./suite/quality-feedback";

type SuiteContext = {
  appType?: "web" | "desktop";
  stack?: "javascript" | "typescript";
};

type SuiteRunOptions = {
  campaignHours?: string;
  campaignMaxCycles?: string;
  campaignSleepSeconds?: string;
  campaignTargetStage?: string;
  campaignAutonomous?: boolean;
  campaignStallCycles?: string;
};

type CampaignPolicy = {
  minRuntimeMinutes: number;
  maxCycles: number;
  sleepSeconds: number;
  targetStage: DeliveryStage;
  autonomous: boolean;
  stallCycles: number;
};

type RecoveryTier = "none" | "tier1" | "tier2" | "tier3" | "tier4";
type SuiteLockHandle = { lockPath: string; pid: number };

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
  const hoursInput = options?.campaignHours ?? process.env.SDD_SUITE_CAMPAIGN_HOURS ?? "6";
  const cyclesInput = options?.campaignMaxCycles ?? process.env.SDD_SUITE_CAMPAIGN_MAX_CYCLES ?? "24";
  const sleepInput = options?.campaignSleepSeconds ?? process.env.SDD_SUITE_CAMPAIGN_SLEEP_SECONDS ?? "5";
  const stageInput = options?.campaignTargetStage ?? process.env.SDD_SUITE_CAMPAIGN_TARGET_STAGE ?? "runtime_start";
  const autonomous = options?.campaignAutonomous ?? process.env.SDD_SUITE_CAMPAIGN_AUTONOMOUS !== "0";
  const stallCyclesInput = options?.campaignStallCycles ?? process.env.SDD_SUITE_CAMPAIGN_STALL_CYCLES ?? "2";

  const hours = clampFloat(Number.parseFloat(hoursInput), 0, 0, 24);
  const minRuntimeMinutes = clampInt(Math.round(hours * 60), 0, 0, 24 * 60);
  const maxCycles = clampInt(Number.parseInt(cyclesInput, 10), 24, 1, 500);
  const sleepSeconds = clampInt(Number.parseInt(sleepInput, 10), 5, 0, 300);
  const targetStage = parseTargetStage(stageInput);
  const stallCycles = clampInt(Number.parseInt(stallCyclesInput, 10), 2, 1, 20);
  return { minRuntimeMinutes, maxCycles, sleepSeconds, targetStage, autonomous: Boolean(autonomous), stallCycles };
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
    const lifeRoot = path.join(projectRoot, "life");
    fs.mkdirSync(lifeRoot, { recursive: true });
    fs.appendFileSync(path.join(lifeRoot, "recovery-events.jsonl"), `${JSON.stringify(entry)}\n`, "utf-8");
  } catch {
    // best effort
  }
}

function appendRecoveryAudit(
  projectRoot: string,
  entry: {
    cycle: number;
    tier: RecoveryTier;
    action: string;
    outcome: string;
    blockingSignals: string[];
    lifecycleFailCount: number;
    stageFailures: string[];
  }
): void {
  try {
    fs.mkdirSync(projectRoot, { recursive: true });
    const file = path.join(projectRoot, "autonomous-recovery-audit.jsonl");
    const payload = {
      at: new Date().toISOString(),
      ...entry
    };
    fs.appendFileSync(file, `${JSON.stringify(payload)}\n`, "utf-8");
  } catch {
    // best effort
  }
}

function categorizeRootCauses(blockers: string[], providerIssue: ProviderIssueType): string[] {
  const joined = blockers.join("\n").toLowerCase();
  const causes: string[] = [];
  if (/etarget|no matching version found|npm error 404/.test(joined)) {
    causes.push("invalid_or_unavailable_dependency_versions");
  }
  if (/no se reconoce como un comando interno o externo|not recognized as an internal or external command/.test(joined)) {
    causes.push("missing_runtime_dependencies_after_failed_install");
  }
  if (/missing smoke|smoke\/e2e/.test(joined)) {
    causes.push("missing_smoke_validation_script");
  }
  if (/write_file|cannot directly create or modify files|unable to fulfill this request/.test(joined)) {
    causes.push("provider_non_contractual_response");
  }
  if (providerIssue === "quota") {
    causes.push("provider_quota_or_capacity_exhausted");
  }
  if (providerIssue === "command_too_long") {
    causes.push("provider_cli_prompt_length_overflow");
  }
  return [...new Set(causes)];
}

function writeCampaignDebugReport(
  projectRoot: string,
  payload: {
    cycle: number;
    providerIssue: ProviderIssueType;
    model?: string;
    nextFromStep?: string;
    blockingSignals: BlockingSignals;
    recoveryTier: RecoveryTier;
    recoveryAction: string;
    elapsedMinutes: number;
  }
): void {
  try {
    const debugDir = path.join(projectRoot, "debug");
    fs.mkdirSync(debugDir, { recursive: true });
    const rootCauses = categorizeRootCauses(payload.blockingSignals.blockers, payload.providerIssue);
    const recommendations: string[] = [];
    if (rootCauses.includes("provider_cli_prompt_length_overflow")) {
      recommendations.push("keep provider prompts compact and enforce SDD_GEMINI_PROMPT_MAX_CHARS <= 2200 on Windows");
    }
    if (rootCauses.includes("invalid_or_unavailable_dependency_versions")) {
      recommendations.push("replace unavailable package versions and re-run install/test/build gates");
    }
    if (rootCauses.includes("provider_non_contractual_response")) {
      recommendations.push("retry with strict JSON-only contract and minimal file patch prompt");
    }
    if (rootCauses.includes("missing_runtime_dependencies_after_failed_install")) {
      recommendations.push("block progression until npm install succeeds and required binaries are available");
    }
    const file = path.join(debugDir, "campaign-debug-report.json");
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          cycle: payload.cycle,
          elapsedMinutes: payload.elapsedMinutes,
          providerIssue: payload.providerIssue,
          model: payload.model ?? "",
          nextFromStep: payload.nextFromStep ?? "",
          recoveryTier: payload.recoveryTier,
          recoveryAction: payload.recoveryAction,
          blockers: payload.blockingSignals.blockers,
          lifecycleFailCount: payload.blockingSignals.lifecycleFailCount,
          stageFailures: payload.blockingSignals.stageFailures,
          rootCauses,
          recommendations
        },
        null,
        2
      ),
      "utf-8"
    );
  } catch {
    // best effort
  }
}

function writeCampaignState(
  projectRoot: string,
  state: {
    cycle: number;
    elapsedMinutes: number;
    targetStage: DeliveryStage;
    targetPassed: boolean;
    qualityPassed: boolean;
    releasePassed: boolean;
    runtimePassed: boolean;
    model?: string;
    nextFromStep?: string;
    autonomous: boolean;
    stallCount: number;
    running?: boolean;
    suitePid?: number;
    phase?: string;
    lastError?: string;
    recoveryActive?: boolean;
    recoveryTier?: RecoveryTier;
    lastRecoveryAction?: string;
  }
): void {
  try {
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "suite-campaign-state.json"), JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // best effort
  }
}

function readBlockingSignals(projectName?: string): BlockingSignals {
  const projectRoot = resolveProjectRoot(projectName);
  return readBlockingSignalsForProject(projectRoot);
}

function resolveRecoveryTier(streak: number, stalledCycles: number): RecoveryTier {
  if (streak >= 5 || stalledCycles >= 4) return "tier4";
  if (streak >= 4 || stalledCycles >= 3) return "tier3";
  if (streak >= 2 || stalledCycles >= 2) return "tier2";
  if (streak >= 1) return "tier1";
  return "none";
}

function buildRecoveryPlan(tier: RecoveryTier, signals: BlockingSignals): {
  additions: string[];
  action: string;
  forceCreateNextCycle: boolean;
  enableCompactMode: boolean;
} {
  const baseHints = signals.blockers.slice(0, 5).join(" | ");
  if (tier === "tier4") {
    return {
      additions: [
        "Autonomous recovery tier4: perform deep rebuild with strict stage gate enforcement and regenerate artifacts before coding.",
        "Resolve blockers from lifecycle/run-status first, then continue toward release with full quality evidence."
      ],
      action: `tier4 deep recovery + forced create. blockers=${baseHints || "none"}`,
      forceCreateNextCycle: true,
      enableCompactMode: true
    };
  }
  if (tier === "tier3") {
    return {
      additions: [
        "Autonomous recovery tier3: convert unresolved blockers into prioritized P0/P1 stories and implement all P0 immediately.",
        "Re-run quality gates after each fix and provide strict JSON-only file payload."
      ],
      action: `tier3 strict remediation. blockers=${baseHints || "none"}`,
      forceCreateNextCycle: false,
      enableCompactMode: true
    };
  }
  if (tier === "tier2") {
    return {
      additions: [
        "Autonomous recovery tier2: focus only on failing gates and missing artifacts, avoid scope expansion.",
        "Deliver minimal high-confidence edits that close blockers."
      ],
      action: `tier2 gate-focused remediation. blockers=${baseHints || "none"}`,
      forceCreateNextCycle: false,
      enableCompactMode: true
    };
  }
  if (tier === "tier1") {
    return {
      additions: [
        "Autonomous recovery tier1: fix blocking failures first and keep release path aligned with mandatory stages."
      ],
      action: `tier1 recovery prompt boost. blockers=${baseHints || "none"}`,
      forceCreateNextCycle: false,
      enableCompactMode: false
    };
  }
  return { additions: [], action: "no-op", forceCreateNextCycle: false, enableCompactMode: false };
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

function stageRank(projectName: string | undefined): number {
  const projectRoot = resolveProjectRoot(projectName);
  if (!projectRoot) {
    return 0;
  }
  const snapshot = loadStageSnapshot(projectRoot);
  const order: DeliveryStage[] = [
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
  let rank = 0;
  for (let i = 0; i < order.length; i += 1) {
    if (snapshot.stages[order[i]] === "passed") {
      rank = i + 1;
    }
  }
  return rank;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function resolveSuiteLockPath(workspaceRoot: string, projectName?: string): string {
  const cleanProject = String(projectName || "").trim();
  if (!cleanProject) {
    return path.join(workspaceRoot, ".sdd-suite-lock.json");
  }
  return path.join(workspaceRoot, cleanProject, ".sdd-suite-lock.json");
}

function acquireSuiteLock(workspaceRoot: string, projectName?: string): SuiteLockHandle {
  const lockPath = resolveSuiteLockPath(workspaceRoot, projectName);
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    if (fs.existsSync(lockPath)) {
      const raw = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid?: number; startedAt?: string };
      const existingPid = Number(raw?.pid ?? 0);
      if (existingPid > 0 && existingPid !== process.pid && isPidRunning(existingPid)) {
        const scope = projectName ? `project=${projectName}` : "workspace";
        throw new Error(
          `Another suite process is already running (${scope}, pid=${existingPid}, startedAt=${raw?.startedAt || "unknown"}).`
        );
      }
    }
    fs.writeFileSync(
      lockPath,
      JSON.stringify(
        {
          pid: process.pid,
          startedAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf-8"
    );
    return { lockPath, pid: process.pid };
  } catch (error) {
    throw new Error(`Failed to acquire suite lock: ${(error as Error).message}`);
  }
}

function releaseSuiteLock(handle: SuiteLockHandle | null): void {
  if (!handle) return;
  try {
    if (!fs.existsSync(handle.lockPath)) return;
    const raw = JSON.parse(fs.readFileSync(handle.lockPath, "utf-8")) as { pid?: number };
    if (Number(raw?.pid ?? 0) !== handle.pid) {
      return;
    }
    fs.rmSync(handle.lockPath, { force: true });
  } catch {
    // best effort
  }
}

function normalizeCampaignInput(baseInput: string, additions: string[]): string {
  const chunks = [baseInput, ...additions]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const merged = chunks.join(". ");
  const segments = merged
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (!seen.has(key)) {
      deduped.push(segment);
      seen.add(key);
    }
  }
  const filtered = deduped.filter((segment) => {
    const lower = segment.toLowerCase();
    if (lower.startsWith("build target:")) return false;
    if (lower.startsWith("preferred stack:")) return false;
    if (lower.startsWith("finish complete delivery")) return false;
    return true;
  });
  const normalized = filtered.join(". ");
  const maxChars = 900;
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...[truncated]` : normalized;
}

function deriveCanonicalGoal(input: string): string {
  const compact = String(input || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const segments = compact
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((segment) => {
      const lower = segment.toLowerCase();
      if (lower.startsWith("build target:")) return false;
      if (lower.startsWith("preferred stack:")) return false;
      if (lower.startsWith("finish complete delivery")) return false;
      if (lower.includes("continue from the current project state")) return false;
      return true;
    });
  const joined = segments.slice(0, 2).join(". ").trim();
  const maxChars = 220;
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

function composeCampaignInput(goalAnchor: string, baseInput: string, additions: string[]): string {
  const anchor = goalAnchor ? `Primary product objective (do not drift): ${goalAnchor}` : "";
  const cleanedBase = String(baseInput || "")
    .replace(/primary product objective \(do not drift\):/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const seeded = anchor ? `${anchor}. ${cleanedBase}` : cleanedBase;
  return normalizeCampaignInput(seeded, additions);
}

function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function sanitizeStaleCampaignStates(workspaceRoot: string): void {
  try {
    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const entry of entries) {
      const projectRoot = path.join(workspaceRoot, entry.name);
      const stateFile = path.join(projectRoot, "suite-campaign-state.json");
      if (!fs.existsSync(stateFile)) continue;
      const parsed = readJsonFile<{
        running?: boolean;
        suitePid?: number;
        phase?: string;
        lastError?: string;
      }>(stateFile);
      if (!parsed || parsed.running !== true) continue;
      const suitePid = Number(parsed.suitePid || 0);
      const alive = Number.isFinite(suitePid) && suitePid > 0 ? isPidRunning(suitePid) : false;
      if (alive) continue;
      const nextState = {
        ...parsed,
        running: false,
        phase: "stale_state_sanitized",
        lastError: parsed.lastError || "campaign marked stale because suitePid is no longer running"
      };
      fs.writeFileSync(stateFile, JSON.stringify(nextState, null, 2), "utf-8");
      appendCampaignJournal(projectRoot, "campaign.state.sanitized", `stale running=true cleared (suitePid=${suitePid || 0})`);
    }
  } catch {
    // best effort
  }
}

function collectQualityFeedback(projectName?: string): string[] {
  const projectRoot = resolveProjectRoot(projectName);
  return collectQualityFeedbackForProject(projectRoot);
}

function requirementQualityFeedback(projectName?: string): string[] {
  const projectRoot = resolveProjectRoot(projectName);
  return requirementQualityFeedbackForProject(projectRoot);
}

function detectProviderIssueType(projectName?: string): ProviderIssueType {
  const projectRoot = resolveProjectRoot(projectName);
  return detectProviderIssueTypeForProject(projectRoot || undefined);
}

function readRecentQuotaResetHint(projectName?: string): string {
  const projectRoot = resolveProjectRoot(projectName);
  return readRecentQuotaResetHintForProject(projectRoot || undefined);
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

async function runCampaign(input: string, options?: SuiteRunOptions, explicitGoalAnchor?: string): Promise<void> {
  clearExpiredModelAvailability();
  const policy = resolveCampaignPolicy(options);
  const startedAt = Date.now();
  const baseFlags = getFlags();
  const baseIterations = Math.max(1, Math.min(10, baseFlags.iterations || 2));
  const goalAnchor = deriveCanonicalGoal(explicitGoalAnchor || input);
  const qualityRetryPrompt =
    "Continue from the current project state, fix all quality failures, improve architecture/docs/tests, and only deliver production-grade changes.";
  const config = ensureConfig();

  if (policy.minRuntimeMinutes > 0) {
    console.log(
      `Suite campaign enabled: ${policy.minRuntimeMinutes} min minimum runtime, max ${policy.maxCycles} cycles, target stage ${policy.targetStage}, autonomous=${policy.autonomous}.`
    );
  }
  if (policy.minRuntimeMinutes < 360) {
    console.log("Suite policy notice: enforcing minimum 360 minutes for continuous campaign quality mode.");
    policy.minRuntimeMinutes = 360;
  }

  let cycle = 0;
  let lastProject = baseFlags.project;
  let cycleInput = composeCampaignInput(goalAnchor, input, []);
  let previousRank = 0;
  let stalledCycles = 0;
  let providerFailureStreak = 0;
  let blockingFailureStreak = 0;
  let qualityFailureStreak = 0;
  let emergencyBaselineEnabled = false;
  let forceCreateNextCycle = false;
  const previousTemplateFallbackSetting = process.env.SDD_ALLOW_TEMPLATE_FALLBACK;
  const providerName = String(baseFlags.provider || "gemini").trim().toLowerCase();
  const providerResolution = resolveProvider(providerName);
  const modelChooser = providerResolution.ok ? providerResolution.provider.chooseModel : undefined;
  const modelPoolSizeHint = providerName === "gemini" ? 6 : 3;
  const triedModels: string[] = [];
  const selectModel = (reason: ModelSelectionReason, currentModel?: string): string | undefined => {
    if (!modelChooser) {
      return currentModel || baseFlags.model;
    }
    const unavailable = providerName === "gemini" ? listUnavailableModels("gemini") : [];
    const unavailableSet = new Set(unavailable);
    const localTried = [...new Set([...triedModels, ...unavailable])];
    const attempts = Math.max(2, modelPoolSizeHint + 2);
    let selected: string | undefined;
    for (let i = 0; i < attempts; i += 1) {
      const next = modelChooser({
        configuredModel: baseFlags.model,
        currentModel,
        reason,
        failureStreak: providerFailureStreak,
        triedModels: [...localTried]
      });
      if (!next) {
        break;
      }
      if (!triedModels.includes(next)) {
        triedModels.push(next);
      }
      if (!unavailableSet.has(next) || !isModelUnavailable("gemini", next)) {
        selected = next;
        break;
      }
      localTried.push(next);
    }
    if (selected) {
      return selected;
    }
    return currentModel || baseFlags.model;
  };
  let activeModel = selectModel("initial");
  while (true) {
    cycle += 1;
    const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60000);
    const iterationsThisCycle = Math.min(10, baseIterations + Math.max(0, cycle - 1));
    let model = activeModel || baseFlags.model;

    let nextFromStep = chooseResumeStep(lastProject);
    if (forceCreateNextCycle) {
      nextFromStep = "create";
      if (lastProject) {
        clearCheckpoint(lastProject);
      }
      forceCreateNextCycle = false;
    }
    const rankBefore = stageRank(lastProject);
    if (rankBefore <= previousRank) {
      stalledCycles += 1;
    } else {
      stalledCycles = 0;
    }
    previousRank = rankBefore;
    if (stalledCycles >= policy.stallCycles) {
      if (providerFailureStreak > 0) {
        console.log(
          `Suite campaign recovery: detected stage stall for ${stalledCycles} cycles, but provider instability is active; keeping current resume step.`
        );
      } else {
        nextFromStep = "create";
        cycleInput = composeCampaignInput(goalAnchor, input, [
          "Force deep recovery: rebuild from a clean requirement and regenerate production-ready project structure."
        ]);
        if (lastProject) {
          clearCheckpoint(lastProject);
        }
        console.log(`Suite campaign recovery: detected stage stall for ${stalledCycles} cycles, forcing fresh create.`);
      }
    }

    setFlags({
      iterations: iterationsThisCycle,
      model,
      fromStep: nextFromStep,
      project: lastProject,
      nonInteractive: true
    });
    if (policy.autonomous) {
      process.env.SDD_CAMPAIGN_AUTONOMOUS = "1";
    }
    if (model) {
      process.env.SDD_GEMINI_MODEL = model;
    }

    console.log(
      `Suite campaign cycle ${cycle}/${policy.maxCycles} | elapsed ${elapsedMinutes}m | iterations ${iterationsThisCycle}${
        nextFromStep ? ` | resume ${nextFromStep}` : ""
      }`
    );
    const preRoot = resolveProjectRoot(lastProject);
    if (preRoot) {
      writeCampaignState(preRoot, {
        cycle,
        elapsedMinutes,
        targetStage: policy.targetStage,
        targetPassed: false,
        qualityPassed: false,
        releasePassed: false,
        runtimePassed: false,
        model,
        nextFromStep,
        autonomous: policy.autonomous,
        stallCount: stalledCycles,
        running: true,
        suitePid: process.pid,
        phase: "cycle_start",
        recoveryActive: false,
        recoveryTier: "none",
        lastRecoveryAction: ""
      });
    }
    try {
      await runHello(cycleInput, false);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const failRoot = resolveProjectRoot(lastProject);
      if (failRoot) {
        writeCampaignState(failRoot, {
          cycle,
          elapsedMinutes,
          targetStage: policy.targetStage,
          targetPassed: false,
          qualityPassed: false,
          releasePassed: false,
          runtimePassed: false,
          model,
          nextFromStep,
          autonomous: policy.autonomous,
          stallCount: stalledCycles,
          running: true,
          suitePid: process.pid,
          phase: "cycle_error",
          lastError: errMsg
        });
      }
      throw error;
    }
    const qualityFeedback = collectQualityFeedback(lastProject);
    const reqFeedback = requirementQualityFeedback(lastProject);
    cycleInput = composeCampaignInput(goalAnchor, input, [qualityRetryPrompt, ...qualityFeedback, ...reqFeedback]);
    const feedbackRoot = resolveProjectRoot(lastProject);
    if (feedbackRoot && (qualityFeedback.length > 0 || reqFeedback.length > 0)) {
      if (qualityFeedback.length > 0) {
        appendCampaignJournal(feedbackRoot, "campaign.quality.feedback", qualityFeedback.join(" | "));
      }
      if (reqFeedback.length > 0) {
        appendCampaignJournal(feedbackRoot, "campaign.requirements.feedback", reqFeedback.join(" | "));
      }
    }
    lastProject = getFlags().project ?? lastProject;
    let recoveryActive = false;
    let recoveryTier: RecoveryTier = "none";
    let recoveryAction = "";
    const blockingSignals = readBlockingSignals(lastProject);
    if (blockingSignals.blocking) {
      blockingFailureStreak += 1;
      recoveryTier = resolveRecoveryTier(blockingFailureStreak, stalledCycles);
      const plan = buildRecoveryPlan(recoveryTier, blockingSignals);
      if (plan.additions.length > 0) {
        cycleInput = composeCampaignInput(goalAnchor, cycleInput, plan.additions);
      }
      if (plan.enableCompactMode && !process.env.SDD_GEMINI_PROMPT_MAX_CHARS) {
        process.env.SDD_GEMINI_PROMPT_MAX_CHARS = "4200";
      }
      if (plan.forceCreateNextCycle) {
        forceCreateNextCycle = true;
      }
      recoveryActive = recoveryTier !== "none";
      recoveryAction = plan.action;
      const recoveryRoot = resolveProjectRoot(lastProject);
      if (recoveryRoot && recoveryActive) {
        appendCampaignJournal(recoveryRoot, "campaign.recovery.autonomous", recoveryAction);
        appendRecoveryAudit(recoveryRoot, {
          cycle,
          tier: recoveryTier,
          action: recoveryAction,
          outcome: "applied",
          blockingSignals: blockingSignals.blockers,
          lifecycleFailCount: blockingSignals.lifecycleFailCount,
          stageFailures: blockingSignals.stageFailures
        });
      }
    } else {
      blockingFailureStreak = 0;
    }

    const providerIssue = providerName === "gemini" ? detectProviderIssueType(lastProject) : "none";
    if (providerName === "gemini" && providerIssue !== "none") {
      providerFailureStreak += 1;
      const previousModel = model;
      const quotaResetHint = providerIssue === "quota" ? readRecentQuotaResetHint(lastProject) : "";
      if (providerIssue === "quota" && previousModel) {
        markModelUnavailable("gemini", previousModel, quotaResetHint, 60_000);
      }
      const issueLabel =
        providerIssue === "quota"
          ? "quota/capacity"
          : providerIssue === "command_too_long"
            ? "command-length overflow"
            : "non-delivery/unusable output";
      if (providerIssue === "command_too_long") {
        process.env.SDD_GEMINI_PROMPT_MAX_CHARS = "2200";
        cycleInput = composeCampaignInput(goalAnchor, cycleInput, [
          "Provider command-length recovery mode: keep prompts compact and return only minimal JSON file patches.",
          "Avoid large payload transformations; prioritize small high-impact edits."
        ]);
        console.log(`Suite provider recovery: detected ${issueLabel}. Keeping model ${previousModel} and shrinking prompt budget.`);
      } else {
        const reason: ModelSelectionReason = providerIssue === "quota" ? "provider_quota" : "provider_unusable";
        model = selectModel(reason, previousModel) || previousModel;
        activeModel = model;
        console.log(`Suite provider recovery: detected ${issueLabel}. Switching model ${previousModel} -> ${model}.`);
      }
      if (providerIssue === "unusable") {
        cycleInput = composeCampaignInput(goalAnchor, cycleInput, [
          "Provider recovery mode: return strict JSON only with files payload and no markdown.",
          "Keep output concise and ensure files include runnable code, tests, and required delivery docs."
        ]);
      }
      if (providerFailureStreak >= 2) {
        const compactChars = providerFailureStreak >= 4 ? "3200" : "4500";
        process.env.SDD_GEMINI_PROMPT_MAX_CHARS = compactChars;
        cycleInput = composeCampaignInput(goalAnchor, cycleInput, [
          "Compact recovery mode active: concise production edits only, avoid oversized responses."
        ]);
        console.log(`Suite provider recovery: compact prompt mode enabled (max ${compactChars} chars).`);
      }
      const quotaRoot = resolveProjectRoot(lastProject);
      if (quotaRoot) {
        appendCampaignJournal(quotaRoot, "campaign.provider.recovery", `${issueLabel} detected; model ${previousModel} -> ${model}`);
        writeCampaignState(quotaRoot, {
          cycle,
          elapsedMinutes,
          targetStage: policy.targetStage,
          targetPassed: false,
          qualityPassed: false,
          releasePassed: false,
          runtimePassed: false,
          model,
          nextFromStep,
          autonomous: policy.autonomous,
          stallCount: stalledCycles,
          running: true,
          suitePid: process.pid,
          phase: "provider_quota_recovery",
          lastError: `${issueLabel} detected for ${previousModel}; switched to ${model}`,
          recoveryActive: true,
          recoveryTier: recoveryTier === "none" ? "tier2" : recoveryTier,
          lastRecoveryAction: recoveryAction || `provider recovery ${previousModel} -> ${model}`
        });
        appendRecoveryAudit(quotaRoot, {
          cycle,
          tier: recoveryTier === "none" ? "tier2" : recoveryTier,
          action: recoveryAction || `provider recovery ${previousModel} -> ${model}`,
          outcome: "provider-rotation",
          blockingSignals: blockingSignals.blockers,
          lifecycleFailCount: blockingSignals.lifecycleFailCount,
          stageFailures: blockingSignals.stageFailures
        });
        writeCampaignDebugReport(quotaRoot, {
          cycle,
          providerIssue,
          model,
          nextFromStep,
          blockingSignals,
          recoveryTier: recoveryTier === "none" ? "tier2" : recoveryTier,
          recoveryAction: recoveryAction || `provider recovery (${issueLabel})`,
          elapsedMinutes
        });
      }
      if (providerFailureStreak >= Math.max(3, modelPoolSizeHint)) {
        const backoffSecondsRaw = Number.parseInt(process.env.SDD_PROVIDER_BACKOFF_SECONDS ?? "", 10);
        const baseBackoffSeconds = Number.isFinite(backoffSecondsRaw) && backoffSecondsRaw > 0 ? Math.min(900, backoffSecondsRaw) : 90;
        const backoffMaxRaw = Number.parseInt(process.env.SDD_PROVIDER_BACKOFF_MAX_SECONDS ?? "", 10);
        const backoffMaxSeconds = Number.isFinite(backoffMaxRaw) && backoffMaxRaw > 0 ? Math.min(24 * 60 * 60, backoffMaxRaw) : 1800;
        const nextReadyMs = providerIssue === "quota" ? nextAvailabilityMs("gemini") : null;
        const cachedBackoffSeconds = nextReadyMs && nextReadyMs > 0 ? Math.ceil(nextReadyMs / 1000) : 0;
        const backoffSeconds = Math.max(baseBackoffSeconds, Math.min(backoffMaxSeconds, cachedBackoffSeconds || baseBackoffSeconds));
        const msg = `Provider delivery blocked: repeated ${issueLabel} failures across models (${providerFailureStreak} cycles). Backing off ${backoffSeconds}s before next attempt.${
          quotaResetHint ? ` reset_hint=${quotaResetHint}` : ""
        }`;
        console.log(`Suite provider backoff: ${msg}`);
        if (quotaRoot) {
          appendCampaignJournal(quotaRoot, "campaign.provider.blocked", msg);
          writeCampaignState(quotaRoot, {
            cycle,
            elapsedMinutes,
            targetStage: policy.targetStage,
            targetPassed: false,
            qualityPassed: false,
            releasePassed: false,
            runtimePassed: false,
            model,
            nextFromStep,
            autonomous: policy.autonomous,
            stallCount: stalledCycles,
            running: true,
            suitePid: process.pid,
            phase: "provider_backoff",
            lastError: msg
          });
        }
        await sleep(backoffSeconds * 1000);
      }
      if (providerIssue !== "command_too_long" && providerFailureStreak >= 5 && !emergencyBaselineEnabled) {
        emergencyBaselineEnabled = true;
        process.env.SDD_ALLOW_TEMPLATE_FALLBACK = "1";
        const emergencyMsg =
          providerIssue === "quota"
            ? "Emergency baseline mode enabled: provider quota exhaustion detected, template fallback allowed until provider output stabilizes."
            : "Emergency baseline mode enabled: template fallback allowed until provider output stabilizes.";
        console.log(`Suite autonomous recovery: ${emergencyMsg}`);
        if (quotaRoot) {
          appendCampaignJournal(quotaRoot, "campaign.recovery.emergency_baseline_enabled", emergencyMsg);
        }
      }
    } else {
      providerFailureStreak = 0;
      if (emergencyBaselineEnabled) {
        emergencyBaselineEnabled = false;
        if (previousTemplateFallbackSetting === undefined) {
          delete process.env.SDD_ALLOW_TEMPLATE_FALLBACK;
        } else {
          process.env.SDD_ALLOW_TEMPLATE_FALLBACK = previousTemplateFallbackSetting;
        }
        const stableRoot = resolveProjectRoot(lastProject);
        const stableMsg = "Emergency baseline mode disabled after provider stabilization.";
        console.log(`Suite autonomous recovery: ${stableMsg}`);
        if (stableRoot) {
          appendCampaignJournal(stableRoot, "campaign.recovery.emergency_baseline_disabled", stableMsg);
        }
      }
      if ((baseFlags.provider ?? "").toLowerCase() === "gemini" && !process.env.SDD_GEMINI_PROMPT_MAX_CHARS) {
        // keep default
      }
    }

    const targetPassed = stagePassed(lastProject, policy.targetStage);
    const qualityPassed = stagePassed(lastProject, "quality_validation");
    const releasePassed = stagePassed(lastProject, "final_release");
    const runtimePassed = stagePassed(lastProject, "runtime_start");
    const minimumRuntimeMet = policy.minRuntimeMinutes <= 0 || elapsedMinutes >= policy.minRuntimeMinutes;

    const projectRoot = resolveProjectRoot(lastProject);
    if (projectRoot) {
      writeCampaignDebugReport(projectRoot, {
        cycle,
        providerIssue,
        model,
        nextFromStep,
        blockingSignals,
        recoveryTier,
        recoveryAction,
        elapsedMinutes
      });
      writeCampaignState(projectRoot, {
        cycle,
        elapsedMinutes,
        targetStage: policy.targetStage,
        targetPassed,
        qualityPassed,
        releasePassed,
        runtimePassed,
        model,
        nextFromStep,
        autonomous: policy.autonomous,
        stallCount: stalledCycles,
        running: true,
        suitePid: process.pid,
        phase: "cycle_completed",
        lastError: minimumRuntimeMet ? "" : `minimum runtime pending (${elapsedMinutes}/${policy.minRuntimeMinutes}m)`,
        recoveryActive,
        recoveryTier,
        lastRecoveryAction: recoveryAction
      });
      appendCampaignJournal(
        projectRoot,
        "campaign.cycle.completed",
        `cycle=${cycle}; elapsedMin=${elapsedMinutes}; quality=${qualityPassed}; release=${releasePassed}; runtime=${runtimePassed}; target=${policy.targetStage}; targetPassed=${targetPassed}; stall=${stalledCycles}`
      );
    }

    const runtimeRequired = config.git.run_after_finalize;
    const deliveryAccepted =
      qualityPassed && releasePassed && targetPassed && (!runtimeRequired || runtimePassed || policy.targetStage !== "runtime_start");

    if (!qualityPassed) {
      qualityFailureStreak += 1;
      if (qualityFailureStreak >= 2) {
        cycleInput = composeCampaignInput(goalAnchor, cycleInput, [
          "Quality escalation mode: resolve failing lifecycle gates first (lint/test/build/smoke), then enforce docs/architecture/review artifacts."
        ]);
      }
    } else {
      qualityFailureStreak = 0;
    }

    if (deliveryAccepted && minimumRuntimeMet) {
      const doneRoot = resolveProjectRoot(lastProject);
      if (doneRoot) {
        writeCampaignState(doneRoot, {
          cycle,
          elapsedMinutes,
          targetStage: policy.targetStage,
          targetPassed,
          qualityPassed,
          releasePassed,
          runtimePassed,
          model,
          nextFromStep,
          autonomous: policy.autonomous,
          stallCount: stalledCycles,
          running: false,
          suitePid: process.pid,
          phase: "completed"
        });
      }
      console.log(`Suite campaign completed with production gates passed on cycle ${cycle}.`);
      return;
    }
    if (cycle >= policy.maxCycles) {
      if (!minimumRuntimeMet) {
        const contRoot = resolveProjectRoot(lastProject);
        if (contRoot) {
          writeCampaignState(contRoot, {
            cycle,
            elapsedMinutes,
            targetStage: policy.targetStage,
            targetPassed,
            qualityPassed,
            releasePassed,
            runtimePassed,
            model,
            nextFromStep,
            autonomous: policy.autonomous,
            stallCount: stalledCycles,
            running: true,
            suitePid: process.pid,
            phase: "runtime_enforced_continue",
            lastError: `Reached configured max cycles before minimum runtime (${elapsedMinutes}/${policy.minRuntimeMinutes}m). Continuing.`
          });
        }
        console.log(
          `Suite campaign reached max cycles but minimum runtime is not met (${elapsedMinutes}/${policy.minRuntimeMinutes}m). Continuing autonomously.`
        );
        if (policy.sleepSeconds > 0) {
          await sleep(policy.sleepSeconds * 1000);
        }
        continue;
      }
      const maxRoot = resolveProjectRoot(lastProject);
      if (maxRoot) {
        writeCampaignState(maxRoot, {
          cycle,
          elapsedMinutes,
          targetStage: policy.targetStage,
          targetPassed,
          qualityPassed,
          releasePassed,
          runtimePassed,
          model,
          nextFromStep,
          autonomous: policy.autonomous,
          stallCount: stalledCycles,
          running: false,
          suitePid: process.pid,
          phase: "max_cycles"
        });
      }
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
  const runtimeFlags = getFlags();
  console.log("SDD Suite started. Type 'exit' to close.");
  const workspace = getWorkspaceInfo();
  let lock: SuiteLockHandle | null = null;
  try {
    lock = acquireSuiteLock(workspace.root, runtimeFlags.project);
  } catch (error) {
    console.log((error as Error).message);
    return;
  }
  sanitizeStaleCampaignStates(workspace.root);
  const pruned = pruneMissingProjects(workspace);
  if (pruned > 0) {
    console.log(`Suite workspace index sanitized: removed ${pruned} missing project entries.`);
  }

  try {
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
      await runCampaign(enriched, options, current);
      console.log("Suite task completed. Enter next instruction or 'exit'.");
      current = "";
    }
  } finally {
    releaseSuiteLock(lock);
  }
}

export const __internal = {
  resolveCampaignPolicy,
  parseTargetStage,
  chooseResumeStep,
  stageRank,
  detectProviderIssueType
};
