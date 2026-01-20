import fs from "fs";
import path from "path";
import os from "os";

export type ProjectSummary = {
  name: string;
  status: string;
};

export type WorkspaceInfo = {
  root: string;
  indexPath: string;
};

export function getWorkspaceInfo(): WorkspaceInfo {
  const root = process.env.APPDATA
    ? path.join(process.env.APPDATA, "sdd-tool", "workspaces")
    : path.join(os.homedir(), ".config", "sdd-tool", "workspaces");
  const indexPath = path.join(root, "workspaces.json");
  return { root, indexPath };
}

export function listProjects(workspace: WorkspaceInfo): ProjectSummary[] {
  if (!fs.existsSync(workspace.indexPath)) {
    return [];
  }
  const raw = fs.readFileSync(workspace.indexPath, "utf-8");
  const parsed = JSON.parse(raw) as { projects?: Array<{ name?: string; status?: string }> };
  return (parsed.projects ?? []).map((project) => ({
    name: project.name ?? "unknown",
    status: project.status ?? "unknown"
  }));
}
