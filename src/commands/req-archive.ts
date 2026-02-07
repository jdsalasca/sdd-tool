import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo, updateProjectStatus } from "../workspace/index";
import { printError } from "../errors";

function findDoneRequirement(projectRoot: string, reqId: string): string | null {
  const done = path.join(projectRoot, "requirements", "done", reqId);
  return fs.existsSync(done) ? done : null;
}

export async function runReqArchive(): Promise<void> {
  const projectName = await askProjectName();
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    printError("SDD-1241", "Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1242", (error as Error).message);
    return;
  }
  const doneDir = findDoneRequirement(project.root, reqId);
  if (!doneDir) {
    printError("SDD-1243", "Requirement not found in done.");
    return;
  }

  const archiveDir = path.join(project.root, "requirements", "archived", reqId);
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  fs.renameSync(doneDir, archiveDir);
  updateProjectStatus(workspace, project.name, "archived");
  console.log(`Archived requirement in ${archiveDir}`);
}


