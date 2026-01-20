import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { getWorkspaceInfo } from "../workspace/index";
import { renderTemplate, loadTemplate } from "../templates/render";
import { formatList, parseList } from "../utils/list";
import { validateJson } from "../validation/validate";

function findRequirementFile(workspaceRoot: string, project: string, reqId: string): string | null {
  const base = path.join(workspaceRoot, project, "requirements");
  const candidates = [
    path.join(base, "backlog", reqId, "requirement.json"),
    path.join(base, "wip", reqId, "requirement.json"),
    path.join(base, "in-progress", reqId, "requirement.json"),
    path.join(base, "done", reqId, "requirement.json")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export async function runReqRefine(): Promise<void> {
  const projectName = await ask("Project name: ");
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!projectName || !reqId) {
    console.log("Project name and requirement ID are required.");
    return;
  }

  const workspace = getWorkspaceInfo();
  const reqPath = findRequirementFile(workspace.root, projectName, reqId);
  if (!reqPath) {
    console.log("Requirement not found.");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(reqPath, "utf-8"));
  const objective = await ask(`Objective (${raw.objective}): `);
  const scopeIn = await ask("Scope (in) - comma separated: ");
  const scopeOut = await ask("Scope (out) - comma separated: ");
  const acceptance = await ask("Acceptance criteria - comma separated: ");
  const nfrSecurity = await ask("NFR security: ");
  const nfrPerformance = await ask("NFR performance: ");
  const nfrAvailability = await ask("NFR availability: ");

  const updated = {
    ...raw,
    objective: objective || raw.objective,
    scope: {
      in: scopeIn ? parseList(scopeIn) : raw.scope.in,
      out: scopeOut ? parseList(scopeOut) : raw.scope.out
    },
    acceptanceCriteria: acceptance ? parseList(acceptance) : raw.acceptanceCriteria,
    nfrs: {
      security: nfrSecurity || raw.nfrs.security,
      performance: nfrPerformance || raw.nfrs.performance,
      availability: nfrAvailability || raw.nfrs.availability
    },
    updatedAt: new Date().toISOString()
  };

  const validation = validateJson("requirement.schema.json", updated);
  if (!validation.valid) {
    console.log("Requirement validation failed:");
    validation.errors.forEach((error) => console.log(`- ${error}`));
    return;
  }

  fs.writeFileSync(reqPath, JSON.stringify(updated, null, 2), "utf-8");

  const template = loadTemplate("requirement");
  const rendered = renderTemplate(template, {
    title: updated.title,
    id: updated.id,
    objective: updated.objective,
    actors: "N/A",
    scope_in: formatList(updated.scope.in.join(", ")),
    scope_out: formatList(updated.scope.out.join(", ")),
    acceptance_criteria: formatList(updated.acceptanceCriteria.join(", ")),
    nfr_security: updated.nfrs.security,
    nfr_performance: updated.nfrs.performance,
    nfr_availability: updated.nfrs.availability,
    constraints: formatList((updated.constraints ?? []).join(", ")),
    risks: formatList((updated.risks ?? []).join(", ")),
    links: formatList((updated.links ?? []).join(", "))
  });

  const mdPath = reqPath.replace("requirement.json", "requirement.md");
  fs.writeFileSync(mdPath, rendered, "utf-8");
  console.log(`Requirement updated at ${mdPath}`);
}
