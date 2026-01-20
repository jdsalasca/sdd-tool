import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getWorkspaceInfo, updateProjectStatus } from "../workspace/index";

function findDoneRequirement(workspaceRoot: string, project: string, reqId: string): string | null {
  const done = path.join(workspaceRoot, project, "requirements", "done", reqId);
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
  const doneDir = findDoneRequirement(workspace.root, projectName, reqId);
  if (!doneDir) {
    console.log("Requirement not found in done.");
    return;
  }

  const archiveDir = path.join(workspace.root, projectName, "requirements", "archived", reqId);
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  fs.renameSync(doneDir, archiveDir);
  updateProjectStatus(workspace, projectName, "archived");
  console.log(`Archived requirement in ${archiveDir}`);
}
