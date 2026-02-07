import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { printError } from "../errors";

export async function runReqStatus(): Promise<void> {
  const projectName = await askProjectName();
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    printError("SDD-1254", "Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1255", (error as Error).message);
    return;
  }
  const base = path.join(project.root, "requirements");
  const statuses = ["backlog", "wip", "in-progress", "done", "archived"];
  for (const status of statuses) {
    const candidate = path.join(base, status, reqId);
    if (fs.existsSync(candidate)) {
      console.log(`${reqId} is in ${status}`);
      return;
    }
  }
  printError("SDD-1256", "Requirement not found.");
}


