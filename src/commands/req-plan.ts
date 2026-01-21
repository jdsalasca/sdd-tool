import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getFlags } from "../context/flags";
import { getProjectInfo, getWorkspaceInfo, updateProjectStatus } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { checkRequirementGates } from "../validation/gates";
import { validateJson } from "../validation/validate";

function findRequirementDir(projectRoot: string, reqId: string): string | null {
  const backlog = path.join(projectRoot, "requirements", "backlog", reqId);
  const wip = path.join(projectRoot, "requirements", "wip", reqId);
  if (fs.existsSync(backlog)) return backlog;
  if (fs.existsSync(wip)) return wip;
  return null;
}

export async function runReqPlan(): Promise<void> {
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
  let requirementDir = findRequirementDir(project.root, reqId);
  if (!requirementDir) {
    console.log("Requirement not found in backlog or wip.");
    return;
  }

  const requirementJsonPath = path.join(requirementDir, "requirement.json");
  if (!fs.existsSync(requirementJsonPath)) {
    console.log("Missing requirement.json. Run `req create` first.");
    return;
  }
  const requirementJson = JSON.parse(fs.readFileSync(requirementJsonPath, "utf-8"));
  const gates = checkRequirementGates(requirementJson);
  if (!gates.ok) {
    console.log("Requirement gates failed. Missing:");
    gates.missing.forEach((field) => console.log(`- ${field}`));
    return;
  }
  const requirementValidation = validateJson("requirement.schema.json", requirementJson);
  if (!requirementValidation.valid) {
    console.log("Requirement validation failed:");
    requirementValidation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  const wipDir = path.join(project.root, "requirements", "wip", reqId);
  if (requirementDir.includes(path.join("requirements", "backlog"))) {
    fs.mkdirSync(path.dirname(wipDir), { recursive: true });
    fs.renameSync(requirementDir, wipDir);
    updateProjectStatus(workspace, project.name, "wip");
    requirementDir = wipDir;
  }

  const targetDir = fs.existsSync(wipDir) ? wipDir : requirementDir;
  if (requirementJson.status !== "wip") {
    requirementJson.status = "wip";
  }
  requirementJson.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(targetDir, "requirement.json"), JSON.stringify(requirementJson, null, 2), "utf-8");

  const overview = await ask("Functional overview: ");
  const actors = await ask("Actors - comma separated: ");
  const useCases = await ask("Use cases - comma separated: ");
  const flows = await ask("Flows - comma separated: ");
  const rules = await ask("Business rules - comma separated: ");
  const errors = await ask("Errors - comma separated: ");
  const acceptance = await ask("Acceptance criteria - comma separated: ");

  const stack = await ask("Tech stack - comma separated: ");
  const interfaces = await ask("Interfaces - comma separated: ");
  const dataModel = await ask("Data model - comma separated: ");
  const security = await ask("Security - comma separated: ");
  const techErrors = await ask("Error handling - comma separated: ");
  const performance = await ask("Performance - comma separated: ");
  const observability = await ask("Observability - comma separated: ");

  const context = await ask("Architecture context: ");
  const containers = await ask("Containers - comma separated: ");
  const components = await ask("Components - comma separated: ");
  const deployment = await ask("Deployment - comma separated: ");
  const diagrams = await ask("Diagrams - comma separated: ");

  const criticalPaths = await ask("Test critical paths - comma separated: ");
  const edgeCases = await ask("Test edge cases - comma separated: ");
  const acceptanceTests = await ask("Acceptance tests - comma separated: ");
  const regressions = await ask("Regression tests - comma separated: ");
  const coverageTarget = await ask("Coverage target: ");
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
  const technicalJson = {
    stack: parseList(stack),
    interfaces: parseList(interfaces),
    dataModel: parseList(dataModel),
    security: parseList(security),
    errors: parseList(techErrors),
    performance: parseList(performance),
    observability: parseList(observability)
  };
  const architectureJson = {
    context: context || "N/A",
    containers: parseList(containers),
    components: parseList(components),
    deployment: parseList(deployment),
    diagrams: parseList(diagrams)
  };
  const testPlanJson = {
    criticalPaths: parseList(criticalPaths),
    edgeCases: parseList(edgeCases),
    coverageTarget: coverageTarget || "N/A",
    acceptanceTests: parseList(acceptanceTests),
    regressions: parseList(regressions)
  };

  const validations = [
    validateJson("functional-spec.schema.json", functionalJson),
    validateJson("technical-spec.schema.json", technicalJson),
    validateJson("architecture.schema.json", architectureJson),
    validateJson("test-plan.schema.json", testPlanJson)
  ];
  const failures = validations.flatMap((result) => result.errors);
  if (failures.length > 0) {
    console.log("Spec validation failed:");
    failures.forEach((error) => console.log(`- ${error}`));
    return;
  }

  console.log("Spec validation passed.");

  const functionalTemplate = loadTemplate("functional-spec");
  const technicalTemplate = loadTemplate("technical-spec");
  const architectureTemplate = loadTemplate("architecture");
  const testPlanTemplate = loadTemplate("test-plan");

  const functionalRendered = renderTemplate(functionalTemplate, {
    title: project.name,
    overview: overview || "N/A",
    actors: formatList(actors),
    use_cases: formatList(useCases),
    flows: formatList(flows),
    rules: formatList(rules),
    errors: formatList(errors),
    acceptance_criteria: formatList(acceptance)
  });
  const technicalRendered = renderTemplate(technicalTemplate, {
    title: project.name,
    stack: formatList(stack),
    interfaces: formatList(interfaces),
    data_model: formatList(dataModel),
    security: formatList(security),
    errors: formatList(techErrors),
    performance: formatList(performance),
    observability: formatList(observability)
  });
  const architectureRendered = renderTemplate(architectureTemplate, {
    title: project.name,
    context: context || "N/A",
    containers: formatList(containers),
    components: formatList(components),
    deployment: formatList(deployment),
    diagrams: formatList(diagrams)
  });
  const testPlanRendered = renderTemplate(testPlanTemplate, {
    title: project.name,
    critical_paths: formatList(criticalPaths),
    edge_cases: formatList(edgeCases),
    acceptance_tests: formatList(acceptanceTests),
    regressions: formatList(regressions),
    coverage_target: coverageTarget || "N/A"
  });

  const writes = [
    [path.join(targetDir, "functional-spec.md"), functionalRendered],
    [path.join(targetDir, "functional-spec.json"), JSON.stringify(functionalJson, null, 2)],
    [path.join(targetDir, "technical-spec.md"), technicalRendered],
    [path.join(targetDir, "technical-spec.json"), JSON.stringify(technicalJson, null, 2)],
    [path.join(targetDir, "architecture.md"), architectureRendered],
    [path.join(targetDir, "architecture.json"), JSON.stringify(architectureJson, null, 2)],
    [path.join(targetDir, "test-plan.md"), testPlanRendered],
    [path.join(targetDir, "test-plan.json"), JSON.stringify(testPlanJson, null, 2)]
  ] as const;

  if (flags.parallel) {
    await Promise.all(
      writes.map(([filePath, content]) => fs.promises.writeFile(filePath, content, "utf-8"))
    );
  } else {
    writes.forEach(([filePath, content]) => fs.writeFileSync(filePath, content, "utf-8"));
  }

  const progressLog = path.join(targetDir, "progress-log.md");
  if (!fs.existsSync(progressLog)) {
    fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
  }
  const logEntry = `\n- ${new Date().toISOString()} generated specs for ${reqId}\n`;
  fs.appendFileSync(progressLog, logEntry, "utf-8");
  if (flags.improve) {
    const improveEntry = `\n- ${new Date().toISOString()} improve: ${improveNote || "refinement requested"}\n`;
    fs.appendFileSync(progressLog, improveEntry, "utf-8");
  }

  const changelog = path.join(targetDir, "changelog.md");
  if (!fs.existsSync(changelog)) {
    fs.writeFileSync(changelog, "# Changelog\n\n", "utf-8");
  }
  const changeEntry = `\n- ${new Date().toISOString()} planned requirement ${reqId}\n`;
  fs.appendFileSync(changelog, changeEntry, "utf-8");
  console.log(`Generated specs in ${targetDir}`);
}


