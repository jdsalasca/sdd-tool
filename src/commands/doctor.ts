import fs from "fs";
import path from "path";
import { ensureWorkspace, getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { validateJson } from "../validation/validate";
import { validatePromptPacks } from "../router/validate-prompt-packs";
import { validateTemplates } from "../templates/validate";

function collectJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function inferSchema(filePath: string): string | null {
  if (filePath.endsWith("requirement.json")) return "requirement.schema.json";
  if (filePath.endsWith("technical-spec.json")) return "technical-spec.schema.json";
  if (filePath.endsWith("functional-spec.json")) return "functional-spec.schema.json";
  if (filePath.endsWith("architecture.json")) return "architecture.schema.json";
  if (filePath.endsWith("test-plan.json")) return "test-plan.schema.json";
  if (filePath.endsWith("quality.json")) return "quality.schema.json";
  if (filePath.endsWith("project-readme.json")) return "project-readme.schema.json";
  return null;
}

function printError(code: string, message: string): void {
  console.log(`[${code}] ${message}`);
}

function ensureOpsFiles(requirementDir: string): string[] {
  const fixed: string[] = [];
  const changelog = path.join(requirementDir, "changelog.md");
  const progressLog = path.join(requirementDir, "progress-log.md");
  if (!fs.existsSync(changelog)) {
    fs.writeFileSync(changelog, "# Changelog\n\n", "utf-8");
    fixed.push(changelog);
  }
  if (!fs.existsSync(progressLog)) {
    fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
    fixed.push(progressLog);
  }
  return fixed;
}

function collectRequirementDirs(root: string): string[] {
  const base = path.join(root, "requirements");
  const statuses = ["backlog", "wip", "in-progress", "done", "archived"];
  const dirs: string[] = [];
  for (const status of statuses) {
    const statusDir = path.join(base, status);
    if (!fs.existsSync(statusDir)) {
      continue;
    }
    const entries = fs.readdirSync(statusDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(path.join(statusDir, entry.name));
      }
    }
  }
  return dirs;
}

export function runDoctor(projectName?: string, reqId?: string, autoFix?: boolean): void {
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);
  let root = workspace.root;
  if (projectName) {
    try {
      root = getProjectInfo(workspace, projectName).root;
    } catch (error) {
      printError("SDD-2001", (error as Error).message);
      process.exitCode = 1;
      return;
    }
  }
  if (projectName && reqId) {
    const base = path.join(root, "requirements");
    const candidates = [
      path.join(base, "backlog", reqId),
      path.join(base, "wip", reqId),
      path.join(base, "in-progress", reqId),
      path.join(base, "done", reqId),
      path.join(base, "archived", reqId)
    ];
    root = candidates.find((candidate) => fs.existsSync(candidate)) ?? root;
  }

  let failures = 0;
  let fixes = 0;
  const promptResult = validatePromptPacks();
  if (!promptResult.valid) {
    failures += promptResult.errors.length;
    printError("SDD-2002", "Prompt pack validation failed:");
    promptResult.errors.forEach((error) => printError("SDD-2002", error));
  }
  const templateResult = validateTemplates();
  if (!templateResult.valid) {
    failures += templateResult.errors.length;
    printError("SDD-2003", "Template validation failed:");
    templateResult.errors.forEach((error) => printError("SDD-2003", error));
  }

  if (autoFix) {
    const requirementDirs = reqId ? [root] : collectRequirementDirs(root);
    for (const dir of requirementDirs) {
      const fixed = ensureOpsFiles(dir);
      fixes += fixed.length;
      fixed.forEach((filePath) => console.log(`[SDD-2004] Fixed: ${filePath}`));
    }
  }

  const jsonFiles = collectJsonFiles(root);
  if (jsonFiles.length === 0) {
    console.log("No JSON artifacts found in workspace.");
  }

  for (const filePath of jsonFiles) {
    const schema = inferSchema(filePath);
    if (!schema) {
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (error) {
      failures += 1;
      printError("SDD-2005", `Invalid JSON: ${filePath}`);
      printError("SDD-2005", (error as Error).message);
      continue;
    }
    const result = validateJson(schema, data);
    if (!result.valid) {
      failures += 1;
      printError("SDD-2006", `Invalid: ${filePath}`);
      result.errors.forEach((error) => printError("SDD-2006", error));
    } else {
      console.log(`Valid: ${filePath}`);
    }
  }

  if (fixes > 0) {
    console.log(`[SDD-2004] Applied fixes: ${fixes}`);
  }

  if (failures === 0 && jsonFiles.length > 0) {
    console.log("All JSON artifacts are valid.");
  } else if (failures === 0) {
    console.log("Prompt packs and templates are valid.");
  } else {
    printError("SDD-2007", `Validation failed for ${failures} artifact(s).`);
    process.exitCode = 1;
  }
}
