import { ensureWorkspace, getWorkspaceInfo } from "../workspace/index";

export function runInit(): void {
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);
  console.log(`Workspace initialized at: ${workspace.root}`);
}
