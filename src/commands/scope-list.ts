import { getWorkspaceBaseRoot, listScopes } from "../workspace/index";
import { printError } from "../errors";

export function runScopeList(): void {
  const baseRoot = getWorkspaceBaseRoot();
  const scopes = listScopes(baseRoot);
  if (scopes.length === 0) {
    printError("SDD-1412", "No scopes available in workspace.");
    return;
  }
  console.log(`Workspace base: ${baseRoot}`);
  console.log("Scopes:");
  scopes.forEach((scope) => console.log(`- ${scope}`));
}
