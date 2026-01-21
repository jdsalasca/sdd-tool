import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo, updateProjectStatus } from "../workspace/index";

function findDoneRequirement(projectRoot: string, reqId: string): string | null {
  const done = path.join(projectRoot, "requirements", "done", reqId);
  return fs.existsSync(done) ? done : null;
}

export async function runReqArchive(): Promise<void> {
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
  const doneDir = findDoneRequirement(project.root, reqId);
  if (!doneDir) {
    console.log("Requirement not found in done.");
    return;
  }

  const archiveDir = path.join(project.root, "requirements", "archived", reqId);
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  fs.renameSync(doneDir, archiveDir);
  updateProjectStatus(workspace, project.name, "archived");
  console.log(`Archived requirement in ${archiveDir}`);
}
