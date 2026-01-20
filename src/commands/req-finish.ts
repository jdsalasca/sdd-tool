import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getWorkspaceInfo, updateProjectStatus } from "../workspace/index";
import { validateJson } from "../validation/validate";

function findRequirementDir(workspaceRoot: string, project: string, reqId: string): string | null {
  const backlog = path.join(workspaceRoot, project, "requirements", "backlog", reqId);
  const wip = path.join(workspaceRoot, project, "requirements", "wip", reqId);
  const inProgress = path.join(workspaceRoot, project, "requirements", "in-progress", reqId);
  if (fs.existsSync(backlog)) return backlog;
  if (fs.existsSync(wip)) return wip;
  if (fs.existsSync(inProgress)) return inProgress;
  return null;
}

export async function runReqFinish(): Promise<void> {
  const projectName = await ask("Project name: ");
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    console.log("Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  const requirementDir = findRequirementDir(workspace.root, projectName, reqId);
  if (!requirementDir) {
    console.log("Requirement not found.");
    return;
  }

  const jsonFiles = fs.readdirSync(requirementDir).filter((file) => file.endsWith(".json"));
  const schemaMap: Record<string, string> = {
    "requirement.json": "requirement.schema.json",
    "functional-spec.json": "functional-spec.schema.json",
    "technical-spec.json": "technical-spec.schema.json",
    "architecture.json": "architecture.schema.json",
    "test-plan.json": "test-plan.schema.json",
    "quality.json": "quality.schema.json"
  };
  for (const file of jsonFiles) {
    const schema = schemaMap[file];
    if (!schema) continue;
    const data = JSON.parse(fs.readFileSync(path.join(requirementDir, file), "utf-8"));
    const result = validateJson(schema, data);
    if (!result.valid) {
      console.log(`Validation failed for ${file}:`);
      result.errors.forEach((error) => console.log(`- ${error}`));
      return;
    }
  }

  const doneDir = path.join(workspace.root, projectName, "requirements", "done", reqId);
  fs.mkdirSync(path.dirname(doneDir), { recursive: true });
  fs.renameSync(requirementDir, doneDir);
  updateProjectStatus(workspace, projectName, "done");
  console.log(`Moved requirement to ${doneDir}`);
}
