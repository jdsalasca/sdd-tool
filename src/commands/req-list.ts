import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { printError } from "../errors";

const STATUSES = ["backlog", "wip", "in-progress", "done", "archived"];

export async function runReqList(statusFilter?: string): Promise<void> {
  const projectName = await askProjectName();
  if (!projectName) {
    printError("SDD-1251", "Project name is required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1252", (error as Error).message);
    return;
  }
  const base = path.join(project.root, "requirements");
  if (!fs.existsSync(base)) {
    printError("SDD-1253", "No requirements found for this project.");
    return;
  }

  const statuses = statusFilter ? STATUSES.filter((status) => status === statusFilter) : STATUSES;
  for (const status of statuses) {
    const dir = path.join(base, status);
    if (!fs.existsSync(dir)) {
      continue;
    }
    const items = fs.readdirSync(dir).filter((entry) => fs.statSync(path.join(dir, entry)).isDirectory());
    if (items.length > 0) {
      console.log(`${status}:`);
      items.forEach((item) => console.log(`- ${item}`));
    }
  }
}


