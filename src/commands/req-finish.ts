import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo, updateProjectStatus } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { validateJson } from "../validation/validate";
import { printError } from "../errors";

function findRequirementDir(projectRoot: string, reqId: string): string | null {
  const backlog = path.join(projectRoot, "requirements", "backlog", reqId);
  const wip = path.join(projectRoot, "requirements", "wip", reqId);
  const inProgress = path.join(projectRoot, "requirements", "in-progress", reqId);
  if (fs.existsSync(backlog)) return backlog;
  if (fs.existsSync(wip)) return wip;
  if (fs.existsSync(inProgress)) return inProgress;
  return null;
}

function moveDirWithFallback(sourceDir: string, targetDir: string): { ok: boolean; mode: "rename" | "copy"; error?: string } {
  try {
    fs.renameSync(sourceDir, targetDir);
    return { ok: true, mode: "rename" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (code !== "EPERM" && code !== "EXDEV") {
      return { ok: false, mode: "rename", error: (error as Error).message };
    }
    try {
      fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
      return { ok: true, mode: "copy" };
    } catch (copyError) {
      return { ok: false, mode: "copy", error: (copyError as Error).message };
    }
  }
}

function resolveArchiveDir(baseDir: string): string {
  if (!fs.existsSync(baseDir)) {
    return baseDir;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${baseDir}-${stamp}`;
}

export async function runReqFinish(options?: ReqFinishOptions): Promise<ReqFinishResult | null> {
  const auto = Boolean(options?.autofill);
  const projectName = options?.projectName ?? (await askProjectName());
  const reqId = options?.reqId ?? (await ask("Requirement ID (REQ-...): "));
  if (!projectName || !reqId) {
    printError("SDD-1231", "Project name and requirement ID are required.");
    return null;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1232", (error as Error).message);
    return null;
  }
  const requirementDir = findRequirementDir(project.root, reqId);
  if (!requirementDir) {
    printError("SDD-1233", "Requirement not found.");
    return null;
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
      printError("SDD-1234", `Validation failed for ${file}.`);
      result.errors.forEach((error) => printError("SDD-1234", error));
      return null;
    }
  }

  const seed = (options?.seedText ?? "").trim() || "initial scope";
  const overview = auto ? `Project delivery for ${seed}` : await ask("Project overview (for README): ");
  const howToRun = auto ? "Run CLI commands through sdd-cli flow." : await ask("How to run (for README): ");
  const archSummary = auto ? "CLI + templates + schema validation architecture." : await ask("Architecture summary (for README): ");
  const testingNotes = auto ? "Validated with unit and integration CLI tests." : await ask("Testing notes (for README): ");

  const readmeTemplate = loadTemplate("project-readme");
  const readmeRendered = renderTemplate(readmeTemplate, {
    project_name: project.name,
    overview: overview || "N/A",
    how_to_run: howToRun || "N/A",
    architecture_summary: archSummary || "N/A",
    requirements_link: `requirements/done/${reqId}/requirement.md`,
    functional_spec_link: `requirements/done/${reqId}/functional-spec.md`,
    technical_spec_link: `requirements/done/${reqId}/technical-spec.md`,
    architecture_link: `requirements/done/${reqId}/architecture.md`,
    testing_notes: testingNotes || "N/A"
  });

  const readmeJson = {
    projectName: project.name,
    overview: overview || "N/A",
    howToRun: howToRun || "N/A",
    architectureSummary: archSummary || "N/A",
    specs: {
      requirements: `requirements/done/${reqId}/requirement.md`,
      functionalSpec: `requirements/done/${reqId}/functional-spec.md`,
      technicalSpec: `requirements/done/${reqId}/technical-spec.md`,
      architecture: `requirements/done/${reqId}/architecture.md`
    },
    testingNotes: testingNotes || "N/A"
  };

  const readmeValidation = validateJson("project-readme.schema.json", readmeJson);
  if (!readmeValidation.valid) {
    printError("SDD-1235", "Project README validation failed.");
    readmeValidation.errors.forEach((error) => printError("SDD-1235", error));
    return null;
  }

  const sourceDir = requirementDir;
  const sourceStatus = path.basename(path.dirname(sourceDir));
  const doneDir = path.join(project.root, "requirements", "done", reqId);
  const projectRoot = project.root;
  let moved = false;
  let moveMode: "rename" | "copy" = "rename";
  try {
    if (sourceDir !== doneDir) {
      fs.mkdirSync(path.dirname(doneDir), { recursive: true });
      const move = moveDirWithFallback(sourceDir, doneDir);
      if (!move.ok) {
        throw new Error(`move requirement directory failed: ${move.error || "unknown move failure"}`);
      }
      moveMode = move.mode;
      moved = true;
    }
    updateProjectStatus(workspace, project.name, "done");

    const requirementJsonPath = path.join(doneDir, "requirement.json");
    if (fs.existsSync(requirementJsonPath)) {
      const requirementJson = JSON.parse(fs.readFileSync(requirementJsonPath, "utf-8"));
      requirementJson.status = "done";
      requirementJson.updatedAt = new Date().toISOString();
      fs.writeFileSync(requirementJsonPath, JSON.stringify(requirementJson, null, 2), "utf-8");
    }

    fs.writeFileSync(path.join(projectRoot, "project-readme.md"), readmeRendered, "utf-8");
    fs.writeFileSync(path.join(projectRoot, "project-readme.json"), JSON.stringify(readmeJson, null, 2), "utf-8");

    const decisionLog = path.join(doneDir, "decision-log");
    if (fs.existsSync(decisionLog)) {
      const archiveBase = path.join(projectRoot, "decision-log", reqId);
      const archiveTarget = resolveArchiveDir(archiveBase);
      fs.mkdirSync(path.dirname(archiveTarget), { recursive: true });
      const archived = moveDirWithFallback(decisionLog, archiveTarget);
      if (!archived.ok) {
        printError("SDD-1236", `Warning: decision-log archive skipped (${archived.error || "unknown error"}).`);
      }
    }
    const progressLog = path.join(doneDir, "progress-log.md");
    if (!fs.existsSync(progressLog)) {
      fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
    }
    const logEntry = `\n- ${new Date().toISOString()} finished requirement ${reqId}\n`;
    fs.appendFileSync(progressLog, logEntry, "utf-8");
    const changelog = path.join(doneDir, "changelog.md");
    if (!fs.existsSync(changelog)) {
      fs.writeFileSync(changelog, "# Changelog\n\n", "utf-8");
    }
    const changeEntry = `\n- ${new Date().toISOString()} finished requirement ${reqId}\n`;
    fs.appendFileSync(changelog, changeEntry, "utf-8");
  } catch (error) {
    if (moved && fs.existsSync(doneDir) && !fs.existsSync(sourceDir)) {
      const rollback = moveDirWithFallback(doneDir, sourceDir);
      if (!rollback.ok) {
        printError("SDD-1236", `Rollback warning: could not restore requirement directory (${rollback.error || "unknown rollback failure"}).`);
      } else {
        printError("SDD-1236", `Rollback applied using ${rollback.mode} mode after failure.`);
      }
    }
    if (sourceStatus && sourceStatus !== "done") {
      updateProjectStatus(workspace, project.name, sourceStatus);
    }
    printError("SDD-1236", `Failed to finish requirement: ${(error as Error).message}`);
    return null;
  }

  console.log(`Moved requirement to ${doneDir} (${moveMode})`);
  return { reqId, doneDir };
}



export type ReqFinishOptions = {
  projectName?: string;
  reqId?: string;
  autofill?: boolean;
  seedText?: string;
};

export type ReqFinishResult = {
  reqId: string;
  doneDir: string;
};
