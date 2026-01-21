import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getFlags } from "../context/flags";
import { getProjectInfo, getWorkspaceInfo, updateProjectStatus } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList } from "../utils/list";
import { validateJson } from "../validation/validate";

function findRequirementDir(projectRoot: string, reqId: string): string | null {
  const backlog = path.join(projectRoot, "requirements", "backlog", reqId);
  const wip = path.join(projectRoot, "requirements", "wip", reqId);
  const inProgress = path.join(projectRoot, "requirements", "in-progress", reqId);
  if (fs.existsSync(backlog)) return backlog;
  if (fs.existsSync(wip)) return wip;
  if (fs.existsSync(inProgress)) return inProgress;
  return null;
}

export async function runReqStart(): Promise<void> {
  const projectName = await ask("Project name: ");
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
    console.log("Requirement not found.");
    return;
  }

  const requirementPath = requirementDir;
  const requiredSpecs = [
    { file: "functional-spec.json", schema: "functional-spec.schema.json" },
    { file: "technical-spec.json", schema: "technical-spec.schema.json" },
    { file: "architecture.json", schema: "architecture.schema.json" },
    { file: "test-plan.json", schema: "test-plan.schema.json" }
  ];
  const missing = requiredSpecs.filter((spec) => !fs.existsSync(path.join(requirementPath, spec.file)));
  if (missing.length > 0) {
    console.log("Cannot start. Missing specs:");
    missing.forEach((spec) => console.log(`- ${spec.file}`));
    return;
  }

  for (const spec of requiredSpecs) {
    const data = JSON.parse(fs.readFileSync(path.join(requirementPath, spec.file), "utf-8"));
    const result = validateJson(spec.schema, data);
    if (!result.valid) {
      console.log(`Spec validation failed for ${spec.file}:`);
      result.errors.forEach((error) => console.log(`- ${error}`));
      return;
    }
  }

  const inProgressDir = path.join(project.root, "requirements", "in-progress", reqId);
  if (!requirementDir.includes(path.join("requirements", "in-progress"))) {
    fs.mkdirSync(path.dirname(inProgressDir), { recursive: true });
    fs.renameSync(requirementDir, inProgressDir);
    updateProjectStatus(workspace, project.name, "in-progress");
    requirementDir = inProgressDir;
  }

  const targetDir = fs.existsSync(inProgressDir) ? inProgressDir : requirementDir;
  const requirementJsonPath = path.join(targetDir, "requirement.json");
  if (fs.existsSync(requirementJsonPath)) {
    const requirementJson = JSON.parse(fs.readFileSync(requirementJsonPath, "utf-8"));
    requirementJson.status = "in-progress";
    requirementJson.updatedAt = new Date().toISOString();
    fs.writeFileSync(requirementJsonPath, JSON.stringify(requirementJson, null, 2), "utf-8");
  }

  const milestones = await ask("Milestones - comma separated: ");
  const tasks = await ask("Tasks - comma separated: ");
  const dependencies = await ask("Dependencies - comma separated: ");
  const risks = await ask("Risks - comma separated: ");
  const flags = getFlags();
  const improveNote = flags.improve ? await ask("Improve focus (optional): ") : "";

  const implementationTemplate = loadTemplate("implementation-plan");
  const rendered = renderTemplate(implementationTemplate, {
    title: project.name,
    milestones: formatList(milestones),
    tasks: formatList(tasks),
    dependencies: formatList(dependencies),
    risks: formatList(risks)
  });

  const qualityPath = path.join(targetDir, "quality.yml");
  if (!fs.existsSync(qualityPath)) {
    const qualityTemplate = loadTemplate("quality");
    fs.writeFileSync(qualityPath, qualityTemplate, "utf-8");
  }

  const qualityJson = {
    rules: ["single-responsibility", "tests-for-critical-flows"],
    thresholds: { coverage: "80%", complexity: "10" },
    profiles: {}
  };
  const validation = validateJson("quality.schema.json", qualityJson);
  if (!validation.valid) {
    console.log("Quality validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  fs.writeFileSync(path.join(targetDir, "implementation-plan.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(targetDir, "quality.json"), JSON.stringify(qualityJson, null, 2), "utf-8");

  const decisionTemplate = loadTemplate("decision-log");
  const decisionRendered = renderTemplate(decisionTemplate, {
    id: "ADR-0001",
    title: "Initial implementation plan",
    status: "accepted",
    context: "Implementation kickoff",
    decision: "Proceed with planned milestones",
    consequences: "Defines first iteration scope",
    date: new Date().toISOString()
  });
  const decisionDir = path.join(targetDir, "decision-log");
  fs.mkdirSync(decisionDir, { recursive: true });
  fs.writeFileSync(path.join(decisionDir, "ADR-0001.md"), decisionRendered, "utf-8");

  const progressLog = path.join(targetDir, "progress-log.md");
  if (!fs.existsSync(progressLog)) {
    fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
  }
  const logEntry = `\n- ${new Date().toISOString()} started implementation for ${reqId}\n`;
  fs.appendFileSync(progressLog, logEntry, "utf-8");
  if (flags.improve) {
    const improveEntry = `\n- ${new Date().toISOString()} improve: ${improveNote || "refinement requested"}\n`;
    fs.appendFileSync(progressLog, improveEntry, "utf-8");
  }
  const changelog = path.join(targetDir, "changelog.md");
  if (!fs.existsSync(changelog)) {
    fs.writeFileSync(changelog, "# Changelog\n\n", "utf-8");
  }
  const changeEntry = `\n- ${new Date().toISOString()} started implementation for ${reqId}\n`;
  fs.appendFileSync(changelog, changeEntry, "utf-8");

  console.log(`Implementation plan generated in ${targetDir}`);
  console.log(`Status updated to in-progress for ${project.name}`);
}
