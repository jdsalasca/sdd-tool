import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { validateJson } from "../validation/validate";
import { appendProgress, findRequirementDir } from "./gen-utils";

export async function runGenTechnicalSpec(): Promise<void> {
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

  const stack = await ask("Tech stack - comma separated: ");
  const interfaces = await ask("Interfaces - comma separated: ");
  const dataModel = await ask("Data model - comma separated: ");
  const security = await ask("Security - comma separated: ");
  const errors = await ask("Error handling - comma separated: ");
  const performance = await ask("Performance - comma separated: ");
  const observability = await ask("Observability - comma separated: ");

  const technicalJson = {
    stack: parseList(stack),
    interfaces: parseList(interfaces),
    dataModel: parseList(dataModel),
    security: parseList(security),
    errors: parseList(errors),
    performance: parseList(performance),
    observability: parseList(observability)
  };

  const validation = validateJson("technical-spec.schema.json", technicalJson);
  if (!validation.valid) {
    console.log("Technical spec validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  const template = loadTemplate("technical-spec");
  const rendered = renderTemplate(template, {
    title: projectName,
    stack: formatList(stack),
    interfaces: formatList(interfaces),
    data_model: formatList(dataModel),
    security: formatList(security),
    errors: formatList(errors),
    performance: formatList(performance),
    observability: formatList(observability)
  });

  fs.writeFileSync(path.join(requirementDir, "technical-spec.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "technical-spec.json"), JSON.stringify(technicalJson, null, 2), "utf-8");
  appendProgress(requirementDir, `generated technical spec for ${reqId}`);
  console.log(`Technical spec generated in ${requirementDir}`);
}
