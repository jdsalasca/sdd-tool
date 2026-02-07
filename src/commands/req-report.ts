import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { printError } from "../errors";

const REQUIRED_FILES = [
  "requirement.json",
  "functional-spec.json",
  "technical-spec.json",
  "architecture.json",
  "test-plan.json",
  "quality.json"
];

export async function runReqReport(): Promise<void> {
  const projectName = await askProjectName();
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    printError("SDD-1257", "Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1258", (error as Error).message);
    return;
  }
  const base = path.join(project.root, "requirements");
  const statuses = ["backlog", "wip", "in-progress", "done", "archived"];
  const dir = statuses.map((status) => path.join(base, status, reqId)).find((candidate) => fs.existsSync(candidate));
  if (!dir) {
    printError("SDD-1259", "Requirement not found.");
    return;
  }

  console.log(`Requirement report: ${reqId}`);
  let absentCount = 0;
  for (const file of REQUIRED_FILES) {
    const exists = fs.existsSync(path.join(dir, file));
    console.log(`${exists ? "OK" : "ABSENT"}: ${file}`);
    if (!exists) absentCount += 1;
  }
  const projectReadmePath = path.join(project.root, "project-readme.json");
  const projectReadmeExists = fs.existsSync(projectReadmePath);
  console.log(`${projectReadmeExists ? "OK" : "ABSENT"}: ../project-readme.json`);
  if (!projectReadmeExists) {
    absentCount += 1;
  }
  console.log(`Absent files: ${absentCount}`);
}


