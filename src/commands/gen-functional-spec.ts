import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { validateJson } from "../validation/validate";
import { appendImprove, appendProgress, findRequirementDir } from "./gen-utils";
import { getFlags } from "../context/flags";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { printError } from "../errors";

export async function runGenFunctionalSpec(): Promise<void> {
  const projectName = await askProjectName();
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    printError("SDD-1611", "Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1612", (error as Error).message);
    return;
  }
  const requirementDir = findRequirementDir(project.name, reqId);
  if (!requirementDir) {
    printError("SDD-1613", "Requirement not found.");
    return;
  }

  const overview = await ask("Functional overview: ");
  const actors = await ask("Actors - comma separated: ");
  const useCases = await ask("Use cases - comma separated: ");
  const flows = await ask("Flows - comma separated: ");
  const rules = await ask("Business rules - comma separated: ");
  const errors = await ask("Errors - comma separated: ");
  const acceptance = await ask("Acceptance criteria - comma separated: ");
  const flags = getFlags();
  const improveNote = flags.improve ? await ask("Improve focus (optional): ") : "";

  const functionalJson = {
    overview: overview || "N/A",
    actors: parseList(actors),
    useCases: parseList(useCases),
    flows: parseList(flows),
    rules: parseList(rules),
    errors: parseList(errors),
    acceptanceCriteria: parseList(acceptance)
  };

  const validation = validateJson("functional-spec.schema.json", functionalJson);
  if (!validation.valid) {
    printError("SDD-1614", "Functional spec validation failed.");
    validation.errors.forEach((error) => printError("SDD-1614", error));
    return;
  }

  const template = loadTemplate("functional-spec");
  const rendered = renderTemplate(template, {
    title: project.name,
    overview: overview || "N/A",
    actors: formatList(actors),
    use_cases: formatList(useCases),
    flows: formatList(flows),
    rules: formatList(rules),
    errors: formatList(errors),
    acceptance_criteria: formatList(acceptance)
  });

  fs.writeFileSync(path.join(requirementDir, "functional-spec.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "functional-spec.json"), JSON.stringify(functionalJson, null, 2), "utf-8");
  appendProgress(requirementDir, `generated functional spec for ${reqId}`);
  appendImprove(requirementDir, improveNote);
  console.log(`Functional spec generated in ${requirementDir}`);
}


