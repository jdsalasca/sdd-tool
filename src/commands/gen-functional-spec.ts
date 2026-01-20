import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { validateJson } from "../validation/validate";
import { appendProgress, findRequirementDir } from "./gen-utils";

export async function runGenFunctionalSpec(): Promise<void> {
  const projectName = await ask("Project name: ");
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    console.log("Project name and requirement ID are required.");
    return;
  }

  const requirementDir = findRequirementDir(projectName, reqId);
  if (!requirementDir) {
    console.log("Requirement not found.");
    return;
  }

  const overview = await ask("Functional overview: ");
  const useCases = await ask("Use cases - comma separated: ");
  const flows = await ask("Flows - comma separated: ");
  const rules = await ask("Business rules - comma separated: ");
  const errors = await ask("Errors - comma separated: ");
  const acceptance = await ask("Acceptance criteria - comma separated: ");

  const functionalJson = {
    overview: overview || "N/A",
    actors: [],
    useCases: parseList(useCases),
    flows: parseList(flows),
    rules: parseList(rules),
    errors: parseList(errors),
    acceptanceCriteria: parseList(acceptance)
  };

  const validation = validateJson("functional-spec.schema.json", functionalJson);
  if (!validation.valid) {
    console.log("Functional spec validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  const template = loadTemplate("functional-spec");
  const rendered = renderTemplate(template, {
    title: projectName,
    overview: overview || "N/A",
    actors: "N/A",
    use_cases: formatList(useCases),
    flows: formatList(flows),
    rules: formatList(rules),
    errors: formatList(errors),
    acceptance_criteria: formatList(acceptance)
  });

  fs.writeFileSync(path.join(requirementDir, "functional-spec.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "functional-spec.json"), JSON.stringify(functionalJson, null, 2), "utf-8");
  appendProgress(requirementDir, `generated functional spec for ${reqId}`);
  console.log(`Functional spec generated in ${requirementDir}`);
}
