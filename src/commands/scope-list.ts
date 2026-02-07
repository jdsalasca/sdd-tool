import { getWorkspaceBaseRoot, listScopes } from "../workspace/index";

export function runScopeList(): void {
  const baseRoot = getWorkspaceBaseRoot();
  const scopes = listScopes(baseRoot);
  if (scopes.length === 0) {
    console.log("No scopes found.");
    return;
  }
  console.log(`Workspace base: ${baseRoot}`);
  console.log("Scopes:");
  scopes.forEach((scope) => console.log(`- ${scope}`));
}
