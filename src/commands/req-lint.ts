import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { validateJson } from "../validation/validate";
import { printError } from "../errors";

export async function runReqLint(): Promise<void> {
  const projectName = await askProjectName();
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    printError("SDD-1247", "Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1248", (error as Error).message);
    return;
  }
  const base = path.join(project.root, "requirements");
  const locations = ["backlog", "wip", "in-progress", "done", "archived"];
  const dir = locations
    .map((status) => path.join(base, status, reqId))
    .find((candidate) => fs.existsSync(candidate));
  if (!dir) {
    printError("SDD-1249", "Requirement not found.");
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
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (error) {
      failures += 1;
      printError("SDD-1250", `Invalid JSON: ${file}`);
      printError("SDD-1250", (error as Error).message);
      continue;
    }
    const result = validateJson(schema, data);
    if (!result.valid) {
      failures += 1;
      printError("SDD-1250", `Invalid: ${file}`);
      result.errors.forEach((error) => printError("SDD-1250", error));
    } else {
      console.log(`Valid: ${file}`);
    }
  }

  if (failures === 0) {
    console.log("All artifacts valid for this requirement.");
  }
}


