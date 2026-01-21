import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { validateJson } from "../validation/validate";
import { appendImprove, appendProgress, findRequirementDir } from "./gen-utils";
import { getFlags } from "../context/flags";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";

export async function runGenProjectReadme(): Promise<void> {
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
  const requirementDir = findRequirementDir(project.name, reqId);
  if (!requirementDir) {
    console.log("Requirement not found.");
    return;
  }

  const overview = await ask("Project overview: ");
  const howToRun = await ask("How to run: ");
  const architectureSummary = await ask("Architecture summary: ");
  const requirementsLink = await ask("Requirements link/path: ");
  const functionalSpecLink = await ask("Functional spec link/path: ");
  const technicalSpecLink = await ask("Technical spec link/path: ");
  const architectureLink = await ask("Architecture link/path: ");
  const testingNotes = await ask("Testing notes: ");
  const flags = getFlags();
  const improveNote = flags.improve ? await ask("Improve focus (optional): ") : "";

  const projectReadmeJson = {
    projectName: project.name,
    overview: overview || "N/A",
    howToRun: howToRun || "N/A",
    architectureSummary: architectureSummary || "N/A",
    specs: {
      requirements: requirementsLink || "requirements/requirement.md",
      functionalSpec: functionalSpecLink || "requirements/functional-spec.md",
      technicalSpec: technicalSpecLink || "requirements/technical-spec.md",
      architecture: architectureLink || "requirements/docs/ARCHITECTURE.md"
    },
    testingNotes: testingNotes || "N/A"
  };

  const validation = validateJson("project-readme.schema.json", projectReadmeJson);
  if (!validation.valid) {
    console.log("Project README validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  const template = loadTemplate("project-readme");
  const rendered = renderTemplate(template, {
    project_name: project.name,
    overview: projectReadmeJson.overview,
    how_to_run: projectReadmeJson.howToRun,
    architecture_summary: projectReadmeJson.architectureSummary,
    requirements_link: projectReadmeJson.specs.requirements,
    functional_spec_link: projectReadmeJson.specs.functionalSpec,
    technical_spec_link: projectReadmeJson.specs.technicalSpec,
    architecture_link: projectReadmeJson.specs.architecture,
    testing_notes: projectReadmeJson.testingNotes
  });

  fs.writeFileSync(path.join(requirementDir, "project-readme.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "project-readme.json"), JSON.stringify(projectReadmeJson, null, 2), "utf-8");

  appendProgress(requirementDir, `generated project readme for ${reqId}`);
  appendImprove(requirementDir, improveNote);
  console.log(`Project README generated in ${requirementDir}`);
}



