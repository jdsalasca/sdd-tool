import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { createProject, getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { checkRequirementGates } from "../validation/gates";
import { validateJson } from "../validation/validate";

function generateId(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `REQ-${stamp}`;
}

export type RequirementDraft = {
  objective?: string;
  scope_in?: string;
  scope_out?: string;
  acceptance_criteria?: string;
  nfr_security?: string;
  nfr_performance?: string;
  nfr_availability?: string;
};

export async function runReqCreate(draft?: RequirementDraft): Promise<void> {
  const projectName = await askProjectName();
  const domain = await ask("Domain (software, legal, design, learning, etc): ");
  const actors = await ask("Actors - comma separated: ");
  let objective = draft?.objective ?? (await ask("Objective: "));
  let scopeIn = draft?.scope_in ?? (await ask("Scope (in) - comma separated: "));
  let scopeOut = draft?.scope_out ?? (await ask("Scope (out) - comma separated: "));
  let acceptance = draft?.acceptance_criteria ?? (await ask("Acceptance criteria - comma separated: "));
  let nfrSecurity = draft?.nfr_security ?? (await ask("NFR security: "));
  let nfrPerformance = draft?.nfr_performance ?? (await ask("NFR performance: "));
  let nfrAvailability = draft?.nfr_availability ?? (await ask("NFR availability: "));
  const constraints = await ask("Constraints - comma separated: ");
  const risks = await ask("Risks - comma separated: ");
  const links = await ask("Links - comma separated: ");

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    console.log((error as Error).message);
    return;
  }
  const metadata = createProject(workspace, project.name, domain || "software");
  const reqId = generateId();
  const status = "backlog";

  let requirementJson = {
    id: reqId,
    title: project.name,
    objective: objective || "N/A",
    status,
    actors: parseList(actors),
    scope: {
      in: parseList(scopeIn),
      out: parseList(scopeOut)
    },
    acceptanceCriteria: parseList(acceptance),
    nfrs: {
      security: nfrSecurity || "N/A",
      performance: nfrPerformance || "N/A",
      availability: nfrAvailability || "N/A"
    },
    constraints: parseList(constraints),
    risks: parseList(risks),
    links: parseList(links),
    updatedAt: new Date().toISOString()
  };

  let gates = checkRequirementGates(requirementJson);
  if (!gates.ok) {
    console.log("Requirement gates failed. Please provide missing fields:");
    for (const field of gates.missing) {
      if (field === "objective") objective = await ask("Objective: ");
      if (field === "scope.in") scopeIn = await ask("Scope (in) - comma separated: ");
      if (field === "scope.out") scopeOut = await ask("Scope (out) - comma separated: ");
      if (field === "acceptanceCriteria") acceptance = await ask("Acceptance criteria - comma separated: ");
      if (field === "nfrs.security") nfrSecurity = await ask("NFR security: ");
      if (field === "nfrs.performance") nfrPerformance = await ask("NFR performance: ");
      if (field === "nfrs.availability") nfrAvailability = await ask("NFR availability: ");
    }
    requirementJson = {
      ...requirementJson,
      objective: objective || "N/A",
      scope: {
        in: parseList(scopeIn),
        out: parseList(scopeOut)
      },
      acceptanceCriteria: parseList(acceptance),
      nfrs: {
        security: nfrSecurity || "N/A",
        performance: nfrPerformance || "N/A",
        availability: nfrAvailability || "N/A"
      },
      updatedAt: new Date().toISOString()
    };
    gates = checkRequirementGates(requirementJson);
    if (!gates.ok) {
      console.log("Requirement gates still failing. Missing:");
      gates.missing.forEach((field) => console.log(`- ${field}`));
      return;
    }
  }

  const validation = validateJson("requirement.schema.json", requirementJson);
  if (!validation.valid) {
    console.log("Requirement validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  const requirementDir = path.join(project.root, "requirements", "backlog", reqId);
  fs.mkdirSync(requirementDir, { recursive: true });

  const template = loadTemplate("requirement");
  const rendered = renderTemplate(template, {
    title: project.name,
    id: reqId,
    objective: objective || "N/A",
    actors: formatList(actors),
    scope_in: formatList(scopeIn),
    scope_out: formatList(scopeOut),
    acceptance_criteria: formatList(acceptance),
    nfr_security: nfrSecurity || "N/A",
    nfr_performance: nfrPerformance || "N/A",
    nfr_availability: nfrAvailability || "N/A",
    constraints: formatList(constraints),
    risks: formatList(risks),
    links: formatList(links)
  });

  fs.writeFileSync(path.join(requirementDir, "requirement.md"), rendered, "utf-8");
  fs.writeFileSync(path.join(requirementDir, "requirement.json"), JSON.stringify(requirementJson, null, 2), "utf-8");
  const summaryTemplate = loadTemplate("summary");
  const summary = renderTemplate(summaryTemplate, {
    objective: objective || "N/A",
    decisions: "TBD",
    open_questions: "TBD"
  });
  fs.writeFileSync(path.join(requirementDir, "summary.md"), summary, "utf-8");
  const changelogTemplate = loadTemplate("changelog");
  const changelog = renderTemplate(changelogTemplate, { date: new Date().toISOString() });
  fs.writeFileSync(path.join(requirementDir, "changelog.md"), changelog, "utf-8");
  const progressLogPath = path.join(requirementDir, "progress-log.md");
  if (!fs.existsSync(progressLogPath)) {
    fs.writeFileSync(progressLogPath, "# Progress Log\n\n", "utf-8");
  }
  console.log(`Created requirement in ${requirementDir}`);
  console.log(`Project metadata stored in ${path.join(project.root, "metadata.json")}`);
  console.log(`Project status: ${metadata.status}`);
}


