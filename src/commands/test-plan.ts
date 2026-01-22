import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { validateJson } from "../validation/validate";
import { getFlags } from "../context/flags";

function findRequirementDir(projectRoot: string, reqId: string): string | null {
  const base = path.join(projectRoot, "requirements");
  const statuses = ["backlog", "wip", "in-progress", "done", "archived"];
  for (const status of statuses) {
    const candidate = path.join(base, status, reqId);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function runTestPlan(): Promise<void> {
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
  const requirementDir = findRequirementDir(project.root, reqId);
  if (!requirementDir) {
    console.log("Requirement not found.");
    return;
  }

  const criticalPaths = await ask("Test critical paths - comma separated: ");
  const edgeCases = await ask("Test edge cases - comma separated: ");
  const acceptanceTests = await ask("Acceptance tests - comma separated: ");
  const regressions = await ask("Regression tests - comma separated: ");
  const coverageTarget = await ask("Coverage target: ");
  const flags = getFlags();
  const improveNote = flags.improve ? await ask("Improve focus (optional): ") : "";

  const testPlanJson = {
    criticalPaths: parseList(criticalPaths),
    edgeCases: parseList(edgeCases),
    coverageTarget: coverageTarget || "N/A",
    acceptanceTests: parseList(acceptanceTests),
    regressions: parseList(regressions)
  };

  const validation = validateJson("test-plan.schema.json", testPlanJson);
  if (!validation.valid) {
    console.log("Test plan validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  const template = loadTemplate("test-plan");
  const rendered = renderTemplate(template, {
    title: project.name,
    critical_paths: formatList(criticalPaths),
    edge_cases: formatList(edgeCases),
    acceptance_tests: formatList(acceptanceTests),
    regressions: formatList(regressions),
    coverage_target: coverageTarget || "N/A"
  });

  fs.writeFileSync(path.join(requirementDir, "test-plan.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "test-plan.json"), JSON.stringify(testPlanJson, null, 2), "utf-8");

  const progressLog = path.join(requirementDir, "progress-log.md");
  if (!fs.existsSync(progressLog)) {
    fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
  }
  const logEntry = `\n- ${new Date().toISOString()} updated test plan for ${reqId}\n`;
  fs.appendFileSync(progressLog, logEntry, "utf-8");
  if (flags.improve) {
    const improveEntry = `\n- ${new Date().toISOString()} improve: ${improveNote || "refinement requested"}\n`;
    fs.appendFileSync(progressLog, improveEntry, "utf-8");
  }

  console.log(`Test plan updated in ${requirementDir}`);
}


