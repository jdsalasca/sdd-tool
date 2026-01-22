import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { validateJson } from "../validation/validate";
import { appendImprove, appendProgress, findRequirementDir } from "./gen-utils";
import { getFlags } from "../context/flags";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";

export async function runGenArchitecture(): Promise<void> {
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

  const context = await ask("Architecture context: ");
  const containers = await ask("Containers - comma separated: ");
  const components = await ask("Components - comma separated: ");
  const deployment = await ask("Deployment - comma separated: ");
  const diagrams = await ask("Diagrams - comma separated: ");
  const flags = getFlags();
  const improveNote = flags.improve ? await ask("Improve focus (optional): ") : "";

  const architectureJson = {
    context: context || "N/A",
    containers: parseList(containers),
    components: parseList(components),
    deployment: parseList(deployment),
    diagrams: parseList(diagrams)
  };

  const validation = validateJson("architecture.schema.json", architectureJson);
  if (!validation.valid) {
    console.log("Architecture validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  const template = loadTemplate("architecture");
  const rendered = renderTemplate(template, {
    title: project.name,
    context: context || "N/A",
    containers: formatList(containers),
    components: formatList(components),
    deployment: formatList(deployment),
    diagrams: formatList(diagrams)
  });

  fs.writeFileSync(path.join(requirementDir, "architecture.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "architecture.json"), JSON.stringify(architectureJson, null, 2), "utf-8");
  appendProgress(requirementDir, `generated architecture for ${reqId}`);
  appendImprove(requirementDir, improveNote);
  console.log(`Architecture generated in ${requirementDir}`);
}



