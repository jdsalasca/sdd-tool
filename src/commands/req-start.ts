import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getWorkspaceInfo } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList } from "../utils/list";
import { validateJson } from "../validation/validate";

function findRequirementDir(workspaceRoot: string, project: string, reqId: string): string | null {
  const backlog = path.join(workspaceRoot, project, "requirements", "backlog", reqId);
  const wip = path.join(workspaceRoot, project, "requirements", "wip", reqId);
  const inProgress = path.join(workspaceRoot, project, "requirements", "in-progress", reqId);
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
  const requirementDir = findRequirementDir(workspace.root, projectName, reqId);
  if (!requirementDir) {
    console.log("Requirement not found.");
    return;
  }

  const milestones = await ask("Milestones - comma separated: ");
  const tasks = await ask("Tasks - comma separated: ");
  const dependencies = await ask("Dependencies - comma separated: ");
  const risks = await ask("Risks - comma separated: ");

  const implementationTemplate = loadTemplate("implementation-plan");
  const rendered = renderTemplate(implementationTemplate, {
    title: projectName,
    milestones: formatList(milestones),
    tasks: formatList(tasks),
    dependencies: formatList(dependencies),
    risks: formatList(risks)
  });

  const qualityPath = path.join(requirementDir, "quality.yml");
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

  fs.writeFileSync(path.join(requirementDir, "implementation-plan.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "quality.json"), JSON.stringify(qualityJson, null, 2), "utf-8");

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
  const decisionDir = path.join(requirementDir, "decision-log");
  fs.mkdirSync(decisionDir, { recursive: true });
  fs.writeFileSync(path.join(decisionDir, "ADR-0001.md"), decisionRendered, "utf-8");

  console.log(`Implementation plan generated in ${requirementDir}`);
}
