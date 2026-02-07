import fs from "fs";
import path from "path";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { getFlags } from "../context/flags";
import { printError } from "../errors";

export function findRequirementDir(projectName: string, reqId: string): string | null {
  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1605", (error as Error).message);
    return null;
  }
  const base = path.join(project.root, "requirements");
  const statuses = ["backlog", "wip", "in-progress", "done", "archived"];
  for (const status of statuses) {
    const candidate = path.join(base, status, reqId);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function ensureProgressLog(dir: string): void {
  const progressLog = path.join(dir, "progress-log.md");
  if (!fs.existsSync(progressLog)) {
    fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
  }
}

export function appendProgress(dir: string, message: string): void {
  ensureProgressLog(dir);
  const logEntry = `\n- ${new Date().toISOString()} ${message}\n`;
  fs.appendFileSync(path.join(dir, "progress-log.md"), logEntry, "utf-8");
}

export function appendImprove(dir: string, note?: string): void {
  const flags = getFlags();
  if (!flags.improve) {
    return;
  }
  const message = note && note.trim().length > 0 ? `improve: ${note.trim()}` : "improve: refinement requested";
  appendProgress(dir, message);
}
