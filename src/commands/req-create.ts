import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { createProject, getProjectInfo, getWorkspaceInfo } from "../workspace/index";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { checkRequirementGates } from "../validation/gates";
import { validateJson } from "../validation/validate";
import { printError } from "../errors";

function generateId(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `REQ-${stamp}`;
}

export type RequirementDraft = {
  project_name?: string;
  domain?: string;
  actors?: string;
  objective?: string;
  scope_in?: string;
  scope_out?: string;
  acceptance_criteria?: string;
  nfr_security?: string;
  nfr_performance?: string;
  nfr_availability?: string;
  constraints?: string;
  risks?: string;
  links?: string;
};

export type ReqCreateOptions = {
  autofill?: boolean;
};

export type ReqCreateResult = {
  reqId: string;
  requirementDir: string;
  projectRoot: string;
};

export async function runReqCreate(draft?: RequirementDraft, options?: ReqCreateOptions): Promise<ReqCreateResult | null> {
  const auto = Boolean(options?.autofill);
  const projectName = draft?.project_name?.trim() || (await askProjectName());
  if (!projectName) {
    printError("SDD-1201", "Project name is required.");
    return null;
  }

  const domain = draft?.domain ?? (auto ? "software" : await ask("Domain (software, legal, design, learning, etc): "));
  const actors = draft?.actors ?? (auto ? "user, stakeholder" : await ask("Actors - comma separated: "));
  let objective = draft?.objective ?? (auto ? "Initial requirement draft from user intent." : await ask("Objective: "));
  let scopeIn = draft?.scope_in ?? (auto ? "core workflow" : await ask("Scope (in) - comma separated: "));
  let scopeOut = draft?.scope_out ?? (auto ? "out-of-scope details to refine later" : await ask("Scope (out) - comma separated: "));
  let acceptance =
    draft?.acceptance_criteria ??
    (auto ? "A first working draft is generated and reviewable by stakeholders" : await ask("Acceptance criteria - comma separated: "));
  let nfrSecurity = draft?.nfr_security ?? (auto ? "Apply baseline secure defaults" : await ask("NFR security: "));
  let nfrPerformance = draft?.nfr_performance ?? (auto ? "Reasonable default performance budget" : await ask("NFR performance: "));
  let nfrAvailability = draft?.nfr_availability ?? (auto ? "Service remains available during normal usage" : await ask("NFR availability: "));
  const constraints = draft?.constraints ?? (auto ? "" : await ask("Constraints - comma separated: "));
  const risks = draft?.risks ?? (auto ? "" : await ask("Risks - comma separated: "));
  const links = draft?.links ?? (auto ? "" : await ask("Links - comma separated: "));

  const workspace = getWorkspaceInfo();
  let project;
  try {
    project = getProjectInfo(workspace, projectName);
  } catch (error) {
    printError("SDD-1202", (error as Error).message);
    return null;
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
    printError("SDD-1205", "Requirement gates failed. Please provide missing fields.");
    if (auto) {
      if (gates.missing.includes("objective")) objective = "Initial requirement draft from user intent.";
      if (gates.missing.includes("scope.in")) scopeIn = "core workflow";
      if (gates.missing.includes("scope.out")) scopeOut = "out-of-scope details to refine later";
      if (gates.missing.includes("acceptanceCriteria")) {
        acceptance = "A first working draft is generated and reviewable by stakeholders";
      }
      if (gates.missing.includes("nfrs.security")) nfrSecurity = "Apply baseline secure defaults";
      if (gates.missing.includes("nfrs.performance")) nfrPerformance = "Reasonable default performance budget";
      if (gates.missing.includes("nfrs.availability")) nfrAvailability = "Service remains available during normal usage";
    } else {
      for (const field of gates.missing) {
        if (field === "objective") objective = await ask("Objective: ");
        if (field === "scope.in") scopeIn = await ask("Scope (in) - comma separated: ");
        if (field === "scope.out") scopeOut = await ask("Scope (out) - comma separated: ");
        if (field === "acceptanceCriteria") acceptance = await ask("Acceptance criteria - comma separated: ");
        if (field === "nfrs.security") nfrSecurity = await ask("NFR security: ");
        if (field === "nfrs.performance") nfrPerformance = await ask("NFR performance: ");
        if (field === "nfrs.availability") nfrAvailability = await ask("NFR availability: ");
      }
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
      printError("SDD-1203", "Requirement gates still failing.");
      gates.missing.forEach((field) => printError("SDD-1203", field));
      return null;
    }
  }

  const validation = validateJson("requirement.schema.json", requirementJson);
  if (!validation.valid) {
    printError("SDD-1204", "Requirement validation failed.");
    validation.errors.forEach((error) => printError("SDD-1204", error));
    return null;
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
  return { reqId, requirementDir, projectRoot: project.root };
}


