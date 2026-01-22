import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { validateJson } from "../validation/validate";

export async function runReqLint(): Promise<void> {
  const projectName = await askProjectName();
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
  const locations = ["backlog", "wip", "in-progress", "done", "archived"];
  const dir = locations
    .map((status) => path.join(base, status, reqId))
    .find((candidate) => fs.existsSync(candidate));
  if (!dir) {
    console.log("Requirement not found.");
    return;
  }

  const schemaMap: Record<string, string> = {
    "requirement.json": "requirement.schema.json",
    "functional-spec.json": "functional-spec.schema.json",
    "technical-spec.json": "technical-spec.schema.json",
    "architecture.json": "architecture.schema.json",
    "test-plan.json": "test-plan.schema.json",
    "quality.json": "quality.schema.json",
    "project-readme.json": "project-readme.schema.json"
  };

  let failures = 0;
  for (const [file, schema] of Object.entries(schemaMap)) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const result = validateJson(schema, data);
    if (!result.valid) {
      failures += 1;
      console.log(`Invalid: ${file}`);
      result.errors.forEach((error) => console.log(`- ${error}`));
    } else {
      console.log(`Valid: ${file}`);
    }
  }

  if (failures === 0) {
    console.log("All artifacts valid for this requirement.");
  }
}


