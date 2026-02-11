import fs from "fs";
import path from "path";
import { getProjectInfo, getWorkspaceInfo } from "../../workspace";
import { clearCheckpoint, loadCheckpoint, nextStep } from "../autopilot-checkpoint";
import type { DeliveryStage } from "../stage-machine";
import { loadStageSnapshot } from "../stage-machine";
import { readBlockingSignals as readBlockingSignalsForProject, type BlockingSignals } from "./blocking-signals";
import {
  collectQualityFeedback as collectQualityFeedbackForProject,
  requirementQualityFeedback as requirementQualityFeedbackForProject
} from "./quality-feedback";
import {
  detectProviderIssueType as detectProviderIssueTypeForProject,
  readRecentQuotaResetHint as readRecentQuotaResetHintForProject,
  type ProviderIssueType
} from "./provider-diagnostics";

const STAGE_ORDER: DeliveryStage[] = [
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

export function resolveProjectRoot(projectName?: string): string | null {
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

export function chooseResumeStep(projectName?: string): string | undefined {
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

export function stagePassed(projectName: string | undefined, stage: DeliveryStage): boolean {
  const projectRoot = resolveProjectRoot(projectName);
  if (!projectRoot) {
    return false;
  }
  const snapshot = loadStageSnapshot(projectRoot);
  return snapshot.stages[stage] === "passed";
}

export function stageRank(projectName: string | undefined): number {
  const projectRoot = resolveProjectRoot(projectName);
  if (!projectRoot) {
    return 0;
  }
  const snapshot = loadStageSnapshot(projectRoot);
  let rank = 0;
  for (let i = 0; i < STAGE_ORDER.length; i += 1) {
    if (snapshot.stages[STAGE_ORDER[i]] === "passed") {
      rank = i + 1;
    }
  }
  return rank;
}

export function collectQualityFeedback(projectName?: string): string[] {
  const projectRoot = resolveProjectRoot(projectName);
  return collectQualityFeedbackForProject(projectRoot);
}

export function requirementQualityFeedback(projectName?: string): string[] {
  const projectRoot = resolveProjectRoot(projectName);
  return requirementQualityFeedbackForProject(projectRoot);
}

export function readBlockingSignals(projectName?: string): BlockingSignals {
  const projectRoot = resolveProjectRoot(projectName);
  return readBlockingSignalsForProject(projectRoot);
}

export function detectProviderIssueType(projectName?: string): ProviderIssueType {
  const projectRoot = resolveProjectRoot(projectName);
  return detectProviderIssueTypeForProject(projectRoot || undefined);
}

export function readRecentQuotaResetHint(projectName?: string): string {
  const projectRoot = resolveProjectRoot(projectName);
  return readRecentQuotaResetHintForProject(projectRoot || undefined);
}
