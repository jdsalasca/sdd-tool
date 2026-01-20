import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getWorkspaceInfo } from "../workspace/index";

function findRequirementDir(workspaceRoot: string, project: string, reqId: string): string | null {
  const backlog = path.join(workspaceRoot, project, "requirements", "backlog", reqId);
  const wip = path.join(workspaceRoot, project, "requirements", "wip", reqId);
  const inProgress = path.join(workspaceRoot, project, "requirements", "in-progress", reqId);
  if (fs.existsSync(backlog)) return backlog;
  if (fs.existsSync(wip)) return wip;
  if (fs.existsSync(inProgress)) return inProgress;
  return null;
}

export async function runReqFinish(): Promise<void> {
  const projectName = await ask("Project name: ");
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    console.log("Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  const requirementDir = findRequirementDir(workspace.root, projectName, reqId);
  if (!requirementDir) {
    console.log("Requirement not found.");
    return;
  }

  const doneDir = path.join(workspace.root, projectName, "requirements", "done", reqId);
  fs.mkdirSync(path.dirname(doneDir), { recursive: true });
  fs.renameSync(requirementDir, doneDir);
  console.log(`Moved requirement to ${doneDir}`);
}
