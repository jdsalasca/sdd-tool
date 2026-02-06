import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { validateJson } from "../validation/validate";
import { getFlags } from "../context/flags";

export type TestPlanOptions = {
  projectName?: string;
  reqId?: string;
  autofill?: boolean;
  seedText?: string;
};

export type TestPlanResult = {
  reqId: string;
  requirementDir: string;
};

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

function defaultSeed(seedText?: string): string {
  const text = (seedText ?? "").trim();
  return text.length > 0 ? text : "initial scope";
}

export async function runTestPlan(options?: TestPlanOptions): Promise<TestPlanResult | null> {
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

  const seed = defaultSeed(options?.seedText);
  const criticalPaths = auto ? `core path for ${seed}` : await ask("Test critical paths - comma separated: ");
  const edgeCases = auto ? "invalid data, missing inputs" : await ask("Test edge cases - comma separated: ");
  const acceptanceTests = auto ? "happy path end-to-end generation" : await ask("Acceptance tests - comma separated: ");
  const regressions = auto ? "existing command behavior remains valid" : await ask("Regression tests - comma separated: ");
  const coverageTarget = auto ? "80%" : await ask("Coverage target: ");
  const flags = getFlags();
  const improveNote = flags.improve && !auto ? await ask("Improve focus (optional): ") : "";

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
    return null;
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
  return { reqId, requirementDir };
}
