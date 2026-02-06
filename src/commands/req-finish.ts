import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo, updateProjectStatus } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { validateJson } from "../validation/validate";

function findRequirementDir(projectRoot: string, reqId: string): string | null {
  const backlog = path.join(projectRoot, "requirements", "backlog", reqId);
  const wip = path.join(projectRoot, "requirements", "wip", reqId);
  const inProgress = path.join(projectRoot, "requirements", "in-progress", reqId);
  if (fs.existsSync(backlog)) return backlog;
  if (fs.existsSync(wip)) return wip;
  if (fs.existsSync(inProgress)) return inProgress;
  return null;
}

export async function runReqFinish(options?: ReqFinishOptions): Promise<ReqFinishResult | null> {
  const auto = Boolean(options?.autofill);
  const projectName = options?.projectName ?? (await askProjectName());
  const reqId = options?.reqId ?? (await ask("Requirement ID (REQ-...): "));
  if (!projectName || !reqId) {
    console.log("Project name and requirement ID are required.");
    return null;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    console.log((error as Error).message);
    return null;
  }
  const requirementDir = findRequirementDir(project.root, reqId);
  if (!requirementDir) {
    console.log("Requirement not found.");
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
      console.log(`Validation failed for ${file}:`);
      result.errors.forEach((error) => console.log(`- ${error}`));
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
    console.log("Project README validation failed:");
    readmeValidation.errors.forEach((error) => console.log(`- ${error}`));
    return null;
  }

  const sourceDir = requirementDir;
  const sourceStatus = path.basename(path.dirname(sourceDir));
  const doneDir = path.join(project.root, "requirements", "done", reqId);
  const projectRoot = project.root;
  let moved = false;
  try {
    if (sourceDir !== doneDir) {
      fs.mkdirSync(path.dirname(doneDir), { recursive: true });
      fs.renameSync(sourceDir, doneDir);
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
      const archiveRoot = path.join(projectRoot, "decision-log", reqId);
      fs.mkdirSync(path.dirname(archiveRoot), { recursive: true });
      fs.renameSync(decisionLog, archiveRoot);
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
      fs.renameSync(doneDir, sourceDir);
    }
    if (sourceStatus && sourceStatus !== "done") {
      updateProjectStatus(workspace, project.name, sourceStatus);
    }
    console.log(`Failed to finish requirement: ${(error as Error).message}`);
    return null;
  }

  console.log(`Moved requirement to ${doneDir}`);
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
