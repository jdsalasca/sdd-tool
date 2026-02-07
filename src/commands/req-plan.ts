import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { getFlags } from "../context/flags";
import { getProjectInfo, getWorkspaceInfo, updateProjectStatus } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { checkRequirementGates } from "../validation/gates";
import { validateJson } from "../validation/validate";
import { printError } from "../errors";

export type ReqPlanOptions = {
  projectName?: string;
  reqId?: string;
  autofill?: boolean;
  seedText?: string;
};

export type ReqPlanResult = {
  reqId: string;
  targetDir: string;
};

function findRequirementDir(projectRoot: string, reqId: string): string | null {
  const backlog = path.join(projectRoot, "requirements", "backlog", reqId);
  const wip = path.join(projectRoot, "requirements", "wip", reqId);
  if (fs.existsSync(backlog)) return backlog;
  if (fs.existsSync(wip)) return wip;
  return null;
}

function defaultSeed(seedText?: string): string {
  const text = (seedText ?? "").trim();
  return text.length > 0 ? text : "first delivery";
}

export async function runReqPlan(options?: ReqPlanOptions): Promise<ReqPlanResult | null> {
  const auto = Boolean(options?.autofill);
  const projectName = options?.projectName ?? (await askProjectName());
  const reqId = options?.reqId ?? (await ask("Requirement ID (REQ-...): "));
  if (!projectName || !reqId) {
    printError("SDD-1211", "Project name and requirement ID are required.");
    return null;
  }

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1212", (error as Error).message);
    return null;
  }
  let requirementDir = findRequirementDir(project.root, reqId);
  if (!requirementDir) {
    printError("SDD-1213", "Requirement not found in backlog or wip.");
    return null;
  }

  const requirementJsonPath = path.join(requirementDir, "requirement.json");
  if (!fs.existsSync(requirementJsonPath)) {
    printError("SDD-1214", "Missing requirement.json. Run `req create` first.");
    return null;
  }
  const requirementJson = JSON.parse(fs.readFileSync(requirementJsonPath, "utf-8"));
  let gates = checkRequirementGates(requirementJson);
  if (!gates.ok) {
    printError("SDD-1217", "Requirement gates failed. Please update the requirement first.");
    gates.missing.forEach((field) => printError("SDD-1217", field));
    printError("SDD-1217", "Run `sdd-cli req refine` to complete missing fields.");
    return null;
  }
  const requirementValidation = validateJson("requirement.schema.json", requirementJson);
  if (!requirementValidation.valid) {
    printError("SDD-1215", "Requirement validation failed.");
    requirementValidation.errors.forEach((error) => printError("SDD-1215", error));
    return null;
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

  const seed = defaultSeed(options?.seedText ?? requirementJson.objective);
  const overview = auto ? `Functional overview for ${seed}` : await ask("Functional overview: ");
  const actors = auto ? "user, system" : await ask("Actors - comma separated: ");
  const useCases = auto ? `capture need for ${seed}, deliver first iteration` : await ask("Use cases - comma separated: ");
  const flows = auto ? "discover, plan, implement, validate" : await ask("Flows - comma separated: ");
  const rules = auto ? "maintain traceability, validate artifacts" : await ask("Business rules - comma separated: ");
  const errors = auto ? "invalid input, missing artifact" : await ask("Errors - comma separated: ");
  const acceptance = auto ? "artifacts generated, schemas valid" : await ask("Acceptance criteria - comma separated: ");

  const stack = auto ? "node, typescript" : await ask("Tech stack - comma separated: ");
  const interfaces = auto ? "cli commands, markdown artifacts" : await ask("Interfaces - comma separated: ");
  const dataModel = auto ? "requirement json, spec json" : await ask("Data model - comma separated: ");
  const security = auto ? "safe defaults, input validation" : await ask("Security - comma separated: ");
  const techErrors = auto ? "clear cli errors, retry guidance" : await ask("Error handling - comma separated: ");
  const performance = auto ? "fast local generation" : await ask("Performance - comma separated: ");
  const observability = auto ? "progress logs, changelog entries" : await ask("Observability - comma separated: ");

  const context = auto ? "CLI orchestrator with schema validation" : await ask("Architecture context: ");
  const containers = auto ? "cli runtime, workspace files" : await ask("Containers - comma separated: ");
  const components = auto ? "router, generators, validators" : await ask("Components - comma separated: ");
  const deployment = auto ? "local workstation" : await ask("Deployment - comma separated: ");
  const diagrams = auto ? "context.mmd, container.mmd" : await ask("Diagrams - comma separated: ");

  const criticalPaths = auto ? "hello to requirement, requirement to plan" : await ask("Test critical paths - comma separated: ");
  const edgeCases = auto ? "missing fields, invalid schema" : await ask("Test edge cases - comma separated: ");
  const acceptanceTests = auto ? "generate and validate complete bundle" : await ask("Acceptance tests - comma separated: ");
  const regressions = auto ? "flags behavior, template loading" : await ask("Regression tests - comma separated: ");
  const coverageTarget = auto ? "80%" : await ask("Coverage target: ");
  const flags = getFlags();
  const improveNote = flags.improve && !auto ? await ask("Improve focus (optional): ") : "";

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
    printError("SDD-1216", "Spec validation failed.");
    failures.forEach((error) => printError("SDD-1216", error));
    return null;
  }

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
    await Promise.all(writes.map(([filePath, content]) => fs.promises.writeFile(filePath, content, "utf-8")));
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
  return { reqId, targetDir };
}
