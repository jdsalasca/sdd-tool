import fs from "fs";
import path from "path";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";

export const AUTOPILOT_STEPS = ["create", "plan", "start", "test", "finish"] as const;
export type AutopilotStep = (typeof AUTOPILOT_STEPS)[number];

export type AutopilotCheckpoint = {
  project: string;
  reqId: string;
  seedText: string;
  flow: string;
  domain: string;
  lastCompleted: AutopilotStep;
  updatedAt: string;
};

function checkpointPath(projectName: string): string {
  const workspace = getWorkspaceInfo();
  const project = getProjectInfo(workspace, projectName);
  return path.join(project.root, ".autopilot-checkpoint.json");
}

export function normalizeStep(step?: string): AutopilotStep | null {
  if (!step) return null;
  const raw = step.trim().toLowerCase();
  const map: Record<string, AutopilotStep> = {
    create: "create",
    plan: "plan",
    start: "start",
    test: "test",
    "test-plan": "test",
    finish: "finish"
  };
  return map[raw] ?? null;
}

export function loadCheckpoint(projectName: string): AutopilotCheckpoint | null {
  const file = checkpointPath(projectName);
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as AutopilotCheckpoint;
  } catch {
    return null;
  }
}

export function saveCheckpoint(projectName: string, checkpoint: AutopilotCheckpoint): void {
  const file = checkpointPath(projectName);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(checkpoint, null, 2), "utf-8");
}

export function clearCheckpoint(projectName: string): void {
  const file = checkpointPath(projectName);
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
  }
}

export function nextStep(step: AutopilotStep): AutopilotStep | null {
  const idx = AUTOPILOT_STEPS.indexOf(step);
  if (idx < 0 || idx + 1 >= AUTOPILOT_STEPS.length) {
    return null;
  }
  return AUTOPILOT_STEPS[idx + 1];
}
