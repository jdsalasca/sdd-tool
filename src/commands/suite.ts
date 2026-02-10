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

type ProviderIssueType = "none" | "unusable" | "quota";
type RecoveryTier = "none" | "tier1" | "tier2" | "tier3" | "tier4";
type SuiteLockHandle = { lockPath: string; pid: number };
type BlockingSignals = {
  blocking: boolean;
  blockers: string[];
  lifecycleFailCount: number;
  stageFailures: string[];
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
  if (!projectRoot) {
    return {
      blocking: false,
      blockers: [],
      lifecycleFailCount: 0,
      stageFailures: []
    };
  }
  const runStatus = readJsonFile<{ blockers?: string[] }>(path.join(projectRoot, "sdd-run-status.json"));
  const blockers = Array.isArray(runStatus?.blockers) ? runStatus.blockers.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const lifecycle = readJsonFile<{ steps?: Array<{ ok?: boolean }> }>(
    path.join(projectRoot, "generated-app", "deploy", "lifecycle-report.json")
  );
  const lifecycleFailCount = Array.isArray(lifecycle?.steps) ? lifecycle.steps.filter((step) => !step?.ok).length : 0;
  const stageSnapshot = loadStageSnapshot(projectRoot);
  const stageFailures = Object.entries(stageSnapshot.stages || {})
    .filter(([, value]) => value === "failed")
    .map(([name]) => name);
  return {
    blocking: blockers.length > 0 || lifecycleFailCount > 0 || stageFailures.length > 0,
    blockers: blockers.slice(0, 12),
    lifecycleFailCount,
    stageFailures
  };
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

function acquireSuiteLock(workspaceRoot: string): SuiteLockHandle {
  const lockPath = path.join(workspaceRoot, ".sdd-suite-lock.json");
  try {
    if (fs.existsSync(lockPath)) {
      const raw = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid?: number; startedAt?: string };
      const existingPid = Number(raw?.pid ?? 0);
      if (existingPid > 0 && existingPid !== process.pid && isPidRunning(existingPid)) {
        throw new Error(
          `Another suite process is already running (pid=${existingPid}, startedAt=${raw?.startedAt || "unknown"}).`
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

function extractQuotedValue(input: string, quote: string): string {
  const start = input.indexOf(quote);
  if (start < 0) return "";
  const end = input.indexOf(quote, start + 1);
  if (end < 0) return "";
  return input.slice(start + 1, end).trim();
}

function qualityHintsFromDiagnostics(diagnostics: string[]): string[] {
  const hints = new Set<string>();
  for (const raw of diagnostics) {
    const line = String(raw || "").trim();
    const lower = line.toLowerCase();
    if (!line) continue;
    if (lower.includes("no matching version found for eslint-config-react-app")) {
      hints.add("Remove invalid/deprecated eslint-config-react-app dependency and use a valid eslint baseline.");
    }
    if (lower.includes("eslint") && (lower.includes("not recognized") || lower.includes("no se reconoce"))) {
      hints.add("Ensure eslint is installed as devDependency and lint script is runnable cross-platform.");
    }
    if (lower.includes("jest") && (lower.includes("not recognized") || lower.includes("no se reconoce"))) {
      hints.add("Ensure jest is installed/configured and test script runs locally.");
    }
    if (lower.includes("vite") && (lower.includes("not recognized") || lower.includes("no se reconoce"))) {
      hints.add("Ensure vite is installed as devDependency and build scripts are valid.");
    }
    if (lower.includes("ts-jest") || lower.includes("typescript tests detected")) {
      hints.add("Add ts-jest/typescript dependencies or convert tests to JavaScript consistently.");
    }
    if (lower.includes("jest-environment-jsdom")) {
      hints.add("Add jest-environment-jsdom in devDependencies when testEnvironment is jsdom.");
    }
    if (lower.includes("missing smoke/e2e npm script")) {
      hints.add("Add a real smoke/test:smoke/e2e npm script and keep it cross-platform.");
    }
    if (lower.includes("shell-only path") || lower.includes(".sh")) {
      hints.add("Replace shell-only scripts with node/npm scripts that run on Windows and macOS.");
    }
    if (lower.includes("package \"electron\" is only allowed in \"devdependencies\"")) {
      hints.add("Move electron to devDependencies for desktop packaging compliance.");
    }
    if (lower.includes("missing readme")) {
      hints.add("Add README sections: Features, Run, Testing, Release.");
    }
    if (lower.includes("missing mission.md")) {
      hints.add("Add mission.md with concrete business objective.");
    }
    if (lower.includes("missing vision.md")) {
      hints.add("Add vision.md with growth/release direction.");
    }
    if (lower.includes("missing sql schema file")) {
      hints.add("Add schema.sql documenting relational model and constraints.");
    }
    if (lower.includes("missing backend telemetry config")) {
      hints.add("Add backend telemetry config (metrics/health endpoint and documentation).");
    }
    if (lower.includes("missing bean validation")) {
      hints.add("Use javax/jakarta validation annotations on DTO/request models.");
    }
    const missingDep = /missing dependency '([^']+)'/i.exec(line);
    if (missingDep && missingDep[1]) {
      hints.add(`Add missing dependency ${missingDep[1]} and align imports.`);
    }
    if (lower.includes("cannot find module")) {
      const single = extractQuotedValue(line, "'");
      const dbl = single ? "" : extractQuotedValue(line, "\"");
      const mod = single || dbl;
      if (mod) {
        hints.add(`Install/configure module ${mod} or remove stale import usage.`);
      }
    }
    if (lower.includes("provider response unusable") || lower.includes("did not return valid files")) {
      hints.add("Provider output contract failed. Return strict JSON files payload only and keep response concise.");
    }
    if (lower.includes("ready for your command") || lower.includes("empty output")) {
      hints.add("Provider non-delivery detected. Retry with compact prompt and strict JSON-only contract.");
    }
  }
  return [...hints].slice(0, 8);
}

function collectQualityFeedback(projectName?: string): string[] {
  const projectRoot = resolveProjectRoot(projectName);
  if (!projectRoot) {
    return [];
  }
  const diagnostics: string[] = [];
  const runStatus = readJsonFile<{
    lifecycle?: { diagnostics?: string[] };
    blockers?: string[];
  }>(path.join(projectRoot, "sdd-run-status.json"));
  diagnostics.push(...(runStatus?.lifecycle?.diagnostics ?? []));
  diagnostics.push(...(runStatus?.blockers ?? []));
  const lifecycleReport = readJsonFile<{
    steps?: Array<{ ok?: boolean; command?: string; output?: string }>;
  }>(path.join(projectRoot, "generated-app", "deploy", "lifecycle-report.json"));
  const failedSteps = (lifecycleReport?.steps ?? [])
    .filter((step) => !step?.ok)
    .slice(-6)
    .map((step) => `${String(step?.command || "step")}: ${String(step?.output || "").slice(0, 240)}`);
  diagnostics.push(...failedSteps);
  const qualityBacklog = readJsonFile<{
    entries?: Array<{ diagnostics?: string[]; hints?: string[] }>;
  }>(path.join(projectRoot, "generated-app", "deploy", "quality-backlog.json"));
  const lastBacklog = qualityBacklog?.entries?.at(-1);
  diagnostics.push(...(lastBacklog?.diagnostics ?? []).slice(0, 8));
  diagnostics.push(...(lastBacklog?.hints ?? []).slice(0, 8));
  return qualityHintsFromDiagnostics(
    diagnostics
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .slice(0, 20)
  );
}

function readLatestRequirementJson(projectRoot: string): {
  id: string;
  objective: string;
  actors: string[];
  scopeIn: string[];
  acceptance: string[];
  constraints: string[];
  risks: string[];
} | null {
  try {
    const doneRoot = path.join(projectRoot, "requirements", "done");
    if (!fs.existsSync(doneRoot)) return null;
    const reqDirs = fs
      .readdirSync(doneRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const reqId of reqDirs) {
      const file = path.join(doneRoot, reqId, "requirement.json");
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
        id?: string;
        objective?: string;
        actors?: string[];
        scope?: { in?: string[] };
        acceptanceCriteria?: string[];
        constraints?: string[];
        risks?: string[];
      };
      return {
        id: String(parsed.id || reqId),
        objective: String(parsed.objective || ""),
        actors: Array.isArray(parsed.actors) ? parsed.actors.map((v) => String(v)) : [],
        scopeIn: Array.isArray(parsed.scope?.in) ? parsed.scope.in.map((v) => String(v)) : [],
        acceptance: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria.map((v) => String(v)) : [],
        constraints: Array.isArray(parsed.constraints) ? parsed.constraints.map((v) => String(v)) : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.map((v) => String(v)) : []
      };
    }
  } catch {
    return null;
  }
  return null;
}

function requirementQualityFeedback(projectName?: string): string[] {
  const projectRoot = resolveProjectRoot(projectName);
  if (!projectRoot) return [];
  const req = readLatestRequirementJson(projectRoot);
  if (!req) return [];
  const measurableAcceptance = req.acceptance.filter((item) =>
    /(\d+%|\d+\s*(ms|s|sec|seconds|min|minutes)|p95|p99|under\s+\d+|>=?\s*\d+|<=?\s*\d+)/i.test(item)
  ).length;
  const hints: string[] = [];
  if (req.objective.trim().length < 80) {
    hints.push("Expand objective with explicit business value, target users, and measurable success outcomes.");
  }
  if (req.actors.length < 4) {
    hints.push("Increase actors to at least 4 concrete roles (user, product, QA, operations/security).");
  }
  if (req.scopeIn.length < 8) {
    hints.push("Expand scope_in to at least 8 concrete capabilities tied to product value.");
  }
  if (req.acceptance.length < 10 || measurableAcceptance < 2) {
    hints.push("Add at least 10 acceptance criteria and include at least 2 measurable thresholds.");
  }
  if (req.constraints.length < 4) {
    hints.push("Add at least 4 concrete constraints (platform/runtime/process constraints).");
  }
  if (req.risks.length < 4) {
    hints.push("Add at least 4 concrete delivery risks with mitigation intent.");
  }
  return hints.slice(0, 6);
}

function loadModelFallbacks(baseModel?: string): string[] {
  const raw = process.env.SDD_GEMINI_MODEL_FALLBACKS ?? "gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.0-flash";
  const parsed = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (baseModel && baseModel.trim()) {
    if (!parsed.includes(baseModel.trim())) {
      parsed.unshift(baseModel.trim());
    }
  }
  return parsed.length > 0 ? parsed : [baseModel?.trim() || "gemini-2.5-flash-lite"];
}

function detectProviderIssueType(projectName?: string): ProviderIssueType {
  const projectRoot = resolveProjectRoot(projectName);
  if (!projectRoot) {
    return "none";
  }
  const isQuotaLike = (value: string) => /quota|capacity|terminalquotaerror|429/i.test(value);
  const isUnusableLike = (value: string) =>
    /provider response unusable|provider did not return valid files|no template fallback was applied|ready for your command|empty output/i.test(
      value
    );
  const debugMeta = path.join(projectRoot, "debug", "provider-prompts.metadata.jsonl");
  const providerDebug = path.join(projectRoot, "generated-app", "provider-debug.md");
  const runStatus = path.join(projectRoot, "sdd-run-status.json");
  try {
    if (fs.existsSync(debugMeta)) {
      const lines = fs
        .readFileSync(debugMeta, "utf-8")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-40);
      if (lines.some((line) => isQuotaLike(line))) {
        return "quota";
      }
      if (lines.some((line) => isUnusableLike(line))) {
        return "unusable";
      }
    }
    if (fs.existsSync(providerDebug)) {
      const text = fs.readFileSync(providerDebug, "utf-8");
      if (isQuotaLike(text)) {
        return "quota";
      }
      if (isUnusableLike(text)) {
        return "unusable";
      }
    }
    if (fs.existsSync(runStatus)) {
      const statusRaw = fs.readFileSync(runStatus, "utf-8");
      if (isQuotaLike(statusRaw)) {
        return "quota";
      }
      if (isUnusableLike(statusRaw)) {
        return "unusable";
      }
    }
  } catch {
    return "none";
  }
  return "none";
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
      `Suite campaign enabled: ${policy.minRuntimeMinutes} min minimum runtime, max ${policy.maxCycles} cycles, target stage ${policy.targetStage}, autonomous=${policy.autonomous}.`
    );
  }
  if (policy.minRuntimeMinutes < 360) {
    console.log("Suite policy notice: enforcing minimum 360 minutes for continuous campaign quality mode.");
    policy.minRuntimeMinutes = 360;
  }

  let cycle = 0;
  let lastProject = baseFlags.project;
  let cycleInput = normalizeCampaignInput(input, []);
  let previousRank = 0;
  let stalledCycles = 0;
  let providerFailureStreak = 0;
  let blockingFailureStreak = 0;
  let qualityFailureStreak = 0;
  let emergencyBaselineEnabled = false;
  let forceCreateNextCycle = false;
  const previousTemplateFallbackSetting = process.env.SDD_ALLOW_TEMPLATE_FALLBACK;
  const fallbackModels = loadModelFallbacks(baseFlags.model);
  let modelCursor = Math.max(0, fallbackModels.findIndex((item) => item === baseFlags.model));
  while (true) {
    cycle += 1;
    const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60000);
    const iterationsThisCycle = Math.min(10, baseIterations + Math.max(0, cycle - 1));
    let model = (baseFlags.provider ?? "").toLowerCase() === "gemini" ? fallbackModels[modelCursor] : baseFlags.model;

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
      nextFromStep = "create";
      cycleInput = normalizeCampaignInput(input, [
        "Force deep recovery: rebuild from a clean requirement and regenerate production-ready project structure."
      ]);
      if (lastProject) {
        clearCheckpoint(lastProject);
      }
      console.log(`Suite campaign recovery: detected stage stall for ${stalledCycles} cycles, forcing fresh create.`);
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
    cycleInput = normalizeCampaignInput(input, [qualityRetryPrompt, ...qualityFeedback, ...reqFeedback]);
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
        cycleInput = normalizeCampaignInput(cycleInput, plan.additions);
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

    const providerIssue = (baseFlags.provider ?? "").toLowerCase() === "gemini" ? detectProviderIssueType(lastProject) : "none";
    if ((baseFlags.provider ?? "").toLowerCase() === "gemini" && providerIssue !== "none") {
      providerFailureStreak += 1;
      const previousModel = model;
      modelCursor = (modelCursor + 1) % fallbackModels.length;
      model = fallbackModels[modelCursor];
      const issueLabel = providerIssue === "quota" ? "quota/capacity" : "non-delivery/unusable output";
      console.log(`Suite provider recovery: detected ${issueLabel}. Switching model ${previousModel} -> ${model}.`);
      if (providerIssue === "unusable") {
        cycleInput = normalizeCampaignInput(cycleInput, [
          "Provider recovery mode: return strict JSON only with files payload and no markdown.",
          "Keep output concise and ensure files include runnable code, tests, and required delivery docs."
        ]);
      }
      if (providerFailureStreak >= 2) {
        const compactChars = providerFailureStreak >= 4 ? "3200" : "4500";
        process.env.SDD_GEMINI_PROMPT_MAX_CHARS = compactChars;
        cycleInput = normalizeCampaignInput(cycleInput, [
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
      }
      if (providerFailureStreak >= Math.max(3, fallbackModels.length)) {
        const backoffSecondsRaw = Number.parseInt(process.env.SDD_PROVIDER_BACKOFF_SECONDS ?? "", 10);
        const backoffSeconds = Number.isFinite(backoffSecondsRaw) && backoffSecondsRaw > 0 ? Math.min(900, backoffSecondsRaw) : 90;
        const msg = `Provider delivery blocked: repeated ${issueLabel} failures across models (${providerFailureStreak} cycles). Backing off ${backoffSeconds}s before next attempt.`;
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
      if (providerIssue === "unusable" && providerFailureStreak >= 5 && !emergencyBaselineEnabled) {
        emergencyBaselineEnabled = true;
        process.env.SDD_ALLOW_TEMPLATE_FALLBACK = "1";
        const emergencyMsg = "Emergency baseline mode enabled: template fallback allowed until provider output stabilizes.";
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
        cycleInput = normalizeCampaignInput(cycleInput, [
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
  console.log("SDD Suite started. Type 'exit' to close.");
  const workspace = getWorkspaceInfo();
  let lock: SuiteLockHandle | null = null;
  try {
    lock = acquireSuiteLock(workspace.root);
  } catch (error) {
    console.log((error as Error).message);
    return;
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
      await runCampaign(enriched, options);
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
