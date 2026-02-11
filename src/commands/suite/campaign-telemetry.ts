import fs from "fs";
import path from "path";
import type { DeliveryStage } from "../stage-machine";
import type { BlockingSignals } from "./blocking-signals";
import type { ProviderIssueType } from "./provider-diagnostics";
import { categorizeRootCauses, type RecoveryTier } from "./recovery-planner";

export function appendCampaignJournal(projectRoot: string, event: string, details?: string): void {
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

export function appendRecoveryAudit(
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

export function writeCampaignDebugReport(
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

export function writeCampaignState(
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

export function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}
