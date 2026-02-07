import { getFlags } from "../context/flags";
import { ensureWorkspace, getWorkspaceInfoForScope, listProjects } from "../workspace/index";
import { printError } from "../errors";

export function runScopeStatus(scopeInput?: string): void {
  const flags = getFlags();
  const scope = scopeInput?.trim() || flags.scope || "";
  if (!scope) {
    printError("SDD-1411", "Scope is required. Use: sdd-cli scope status <scope-name>");
    return;
  }

  const workspace = getWorkspaceInfoForScope(scope);
  ensureWorkspace(workspace);
  const projects = listProjects(workspace);
  console.log(`Scope: ${scope}`);
  console.log(`Workspace: ${workspace.root}`);
  if (projects.length === 0) {
    console.log("No projects found for scope.");
    return;
  }

  const byStatus = projects.reduce<Record<string, number>>((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`Projects: ${projects.length}`);
  Object.keys(byStatus)
    .sort()
    .forEach((status) => {
      console.log(`- ${status}: ${byStatus[status]}`);
    });
}
