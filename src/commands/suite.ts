import { ask } from "../ui/prompt";
import { getFlags } from "../context/flags";
import { ensureConfig } from "../config";
import { setFlags } from "../context/flags";
import { runHello } from "./hello";
import { getWorkspaceInfo, pruneMissingProjects } from "../workspace";
import { clearCheckpoint } from "./autopilot-checkpoint";
import { DeliveryStage } from "./stage-machine";
import { resolveProvider } from "../providers";
import type { ModelSelectionReason } from "../providers/types";
import {
  clearExpiredModelAvailability,
  isModelUnavailable,
  listUnavailableModels,
  markModelUnavailable,
  nextAvailabilityMs
} from "../providers/model-availability-cache";
import { composeCampaignInput, deriveCanonicalGoal } from "./suite/campaign-prompt";
import { buildRecoveryPlan, resolveRecoveryTier, type RecoveryTier } from "./suite/recovery-planner";
import { acquireSuiteLock, releaseSuiteLock, type SuiteLockHandle } from "./suite/suite-lock";
import { sanitizeStaleCampaignStates } from "./suite/stale-state";
import { persistBugBacklog } from "./suite/bug-backlog";
import {
  appendCampaignJournal,
  appendRecoveryAudit,
  writeCampaignDebugReport,
  writeCampaignState
} from "./suite/campaign-telemetry";
import {
  chooseResumeStep,
  collectQualityFeedback,
  detectProviderIssueType,
  readBlockingSignals,
  readRecentQuotaResetHint,
  requirementQualityFeedback,
  resolveProjectRoot,
  stagePassed,
  stageRank
} from "./suite/project-progress";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasQualityGateBlockers(blockers: string[]): boolean {
  const joined = blockers.join("\n").toLowerCase();
  return /preflight-quality-check|advanced-quality-check|build|test|lint|smoke|missing dependency|cannot find module|eresolve/.test(joined);
}

function shouldRefineRequirements(projectName?: string): boolean {
  const rank = stageRank(projectName);
  // After implementation starts, requirement prompts should stop accumulating bug-like technical failures.
  return rank < 4;
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
    const preBlockingSignals = readBlockingSignals(lastProject);
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
      } else if (hasQualityGateBlockers(preBlockingSignals.blockers)) {
        nextFromStep = "finish";
        cycleInput = composeCampaignInput(goalAnchor, input, [
          "Stall recovery quality mode: do not restart project scaffolding; stay in finish and close lifecycle blockers in-place."
        ]);
        console.log(
          `Suite campaign recovery: stage stall detected (${stalledCycles} cycles) with quality blockers, enforcing in-place quality remediation.`
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
    const rawQualityFeedback = collectQualityFeedback(lastProject);
    const feedbackRoot = resolveProjectRoot(lastProject);
    const splitFeedback =
      feedbackRoot && lastProject
        ? persistBugBacklog(feedbackRoot, lastProject, rawQualityFeedback, cycle)
        : { bugs: rawQualityFeedback, quality: [] };
    const qualityFeedback = [...splitFeedback.quality, ...splitFeedback.bugs.map((bug) => `Bug fix priority: ${bug}`)];
    const reqFeedback = shouldRefineRequirements(lastProject) ? requirementQualityFeedback(lastProject) : [];
    cycleInput = composeCampaignInput(goalAnchor, input, [qualityRetryPrompt, ...qualityFeedback, ...reqFeedback]);
    if (feedbackRoot && (qualityFeedback.length > 0 || reqFeedback.length > 0)) {
      if (qualityFeedback.length > 0) {
        appendCampaignJournal(feedbackRoot, "campaign.quality.feedback", qualityFeedback.join(" | "));
      }
      if (splitFeedback.bugs.length > 0) {
        appendCampaignJournal(feedbackRoot, "campaign.bugs.feedback", splitFeedback.bugs.join(" | "));
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
