import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getWorkspaceInfo } from "../workspace/index";

export async function runReqExport(): Promise<void> {
  const projectName = await ask("Project name: ");
  const reqId = await ask("Requirement ID (REQ-...): ");
  const outputDir = await ask("Output directory: ");
  if (!projectName || !reqId || !outputDir) {
    console.log("Project name, requirement ID, and output directory are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  const base = path.join(workspace.root, projectName, "requirements");
  const statuses = ["backlog", "wip", "in-progress", "done", "archived"];
  const sourceDir = statuses.map((status) => path.join(base, status, reqId)).find((candidate) => fs.existsSync(candidate));
  if (!sourceDir) {
    console.log("Requirement not found.");
    return;
  }

  const targetDir = path.join(outputDir, `${projectName}-${reqId}`);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir)) {
    const srcPath = path.join(sourceDir, entry);
    const destPath = path.join(targetDir, entry);
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(`Exported requirement artifacts to ${targetDir}`);
}
