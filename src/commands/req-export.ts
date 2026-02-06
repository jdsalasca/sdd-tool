import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";

export async function runReqExport(): Promise<void> {
  const projectName = await askProjectName();
  const reqId = await ask("Requirement ID (REQ-...): ");
  const outputDir = await ask("Output directory: ");
  if (!projectName || !reqId || !outputDir) {
    console.log("Project name, requirement ID, and output directory are required.");
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
  const sourceDir = statuses.map((status) => path.join(base, status, reqId)).find((candidate) => fs.existsSync(candidate));
  if (!sourceDir) {
    console.log("Requirement not found.");
    return;
  }

  const targetDir = path.join(outputDir, `${project.name}-${reqId}`);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir)) {
    const srcPath = path.join(sourceDir, entry);
    const destPath = path.join(targetDir, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else if (stat.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(`Exported requirement artifacts to ${targetDir}`);
}


