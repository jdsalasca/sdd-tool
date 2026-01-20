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

type WorkspaceIndex = {
  projects: Array<{ name: string; status: string }>;
};

export function getWorkspaceInfo(): WorkspaceInfo {
  const root = process.env.APPDATA
    ? path.join(process.env.APPDATA, "sdd-tool", "workspaces")
    : path.join(os.homedir(), ".config", "sdd-tool", "workspaces");
  const indexPath = path.join(root, "workspaces.json");
  return { root, indexPath };
}

export function ensureWorkspace(workspace: WorkspaceInfo): void {
  if (!fs.existsSync(workspace.root)) {
    fs.mkdirSync(workspace.root, { recursive: true });
  }
  if (!fs.existsSync(workspace.indexPath)) {
    const emptyIndex: WorkspaceIndex = { projects: [] };
    fs.writeFileSync(workspace.indexPath, JSON.stringify(emptyIndex, null, 2), "utf-8");
  }
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
