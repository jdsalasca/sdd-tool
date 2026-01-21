import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";

export async function runReqStatus(): Promise<void> {
  const projectName = await ask("Project name: ");
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    console.log("Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    console.log((error as Error).message);
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
  console.log("Requirement not found.");
}
