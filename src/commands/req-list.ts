import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getWorkspaceInfo } from "../workspace/index";

const STATUSES = ["backlog", "wip", "in-progress", "done", "archived"];

export async function runReqList(): Promise<void> {
  const projectName = await ask("Project name: ");
  if (!projectName) {
    console.log("Project name is required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  const base = path.join(workspace.root, projectName, "requirements");
  if (!fs.existsSync(base)) {
    console.log("No requirements found for this project.");
    return;
  }

  for (const status of STATUSES) {
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
