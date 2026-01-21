import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";

const REQUIRED_FILES = [
  "requirement.json",
  "functional-spec.json",
  "technical-spec.json",
  "architecture.json",
  "test-plan.json",
  "quality.json",
  "project-readme.json"
];

export async function runReqReport(): Promise<void> {
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
  const dir = statuses.map((status) => path.join(base, status, reqId)).find((candidate) => fs.existsSync(candidate));
  if (!dir) {
    console.log("Requirement not found.");
    return;
  }

  console.log(`Requirement report: ${reqId}`);
  let missing = 0;
  for (const file of REQUIRED_FILES) {
    const exists = fs.existsSync(path.join(dir, file));
    console.log(`${exists ? "OK" : "MISSING"}: ${file}`);
    if (!exists) missing += 1;
  }
  console.log(`Missing files: ${missing}`);
}
