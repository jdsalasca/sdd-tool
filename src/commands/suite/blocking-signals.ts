import fs from "fs";
import path from "path";
import { loadStageSnapshot } from "../stage-machine";

export type BlockingSignals = {
  blocking: boolean;
  blockers: string[];
  lifecycleFailCount: number;
  stageFailures: string[];
};

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

function isTransientProviderSignal(value: string): boolean {
  return /provider temporarily unavailable|terminalquotaerror|quota|capacity|429|timed out|etimedout|\bdep0040\b|punycode|loaded cached credentials|hook registry initialized/i.test(
    value
  );
}

export function readBlockingSignals(projectRoot?: string | null): BlockingSignals {
  if (!projectRoot) {
    return {
      blocking: false,
      blockers: [],
      lifecycleFailCount: 0,
      stageFailures: []
    };
  }
  const runStatus = readJsonFile<{ blockers?: string[] }>(path.join(projectRoot, "sdd-run-status.json"));
  const blockers = Array.isArray(runStatus?.blockers)
    ? runStatus.blockers
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((value) => !isTransientProviderSignal(value))
    : [];
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
