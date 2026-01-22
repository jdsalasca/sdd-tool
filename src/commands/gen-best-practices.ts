import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { validateJson } from "../validation/validate";
import { appendImprove, appendProgress, findRequirementDir } from "./gen-utils";
import { getFlags } from "../context/flags";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";

function renderQualityYaml(rules: string[], coverage: string, complexity: string): string {
  const ruleLines = rules.length > 0 ? rules.map((rule) => `  - ${rule}`).join("\n") : "  - N/A";
  return [
    "rules:",
    ruleLines,
    "thresholds:",
    `  coverage: \"${coverage}\"`,
    `  complexity: \"${complexity}\"`,
    "profiles:",
    "  default: []"
  ].join("\n");
}

export async function runGenBestPractices(): Promise<void> {
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

  const rules = await ask("Quality rules - comma separated: ");
  const coverage = await ask("Coverage threshold (e.g., 80%): ");
  const complexity = await ask("Complexity threshold (e.g., 10): ");
  const flags = getFlags();
  const improveNote = flags.improve ? await ask("Improve focus (optional): ") : "";

  const qualityJson = {
    rules: rules ? rules.split(",").map((rule) => rule.trim()).filter((rule) => rule) : [],
    thresholds: {
      coverage: coverage || "80%",
      complexity: complexity || "10"
    },
    profiles: {
      default: []
    }
  };

  const validation = validateJson("quality.schema.json", qualityJson);
  if (!validation.valid) {
    console.log("Quality validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  const qualityYaml = renderQualityYaml(
    qualityJson.rules,
    qualityJson.thresholds.coverage,
    qualityJson.thresholds.complexity
  );
  fs.writeFileSync(path.join(requirementDir, "quality.yml"), qualityYaml, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "quality.json"), JSON.stringify(qualityJson, null, 2), "utf-8");

  appendProgress(requirementDir, `generated quality contract for ${reqId}`);
  appendImprove(requirementDir, improveNote);
  console.log(`Quality contract generated in ${requirementDir}`);
}


