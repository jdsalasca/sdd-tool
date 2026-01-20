import fs from "fs";
import path from "path";
import os from "os";

export type ProjectSummary = {
  name: string;
  status: string;
};

export type ProjectMetadata = {
  name: string;
  status: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
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

export function createProject(workspace: WorkspaceInfo, name: string, domain: string): ProjectMetadata {
  ensureWorkspace(workspace);
  const projectRoot = path.join(workspace.root, name);
  if (!fs.existsSync(projectRoot)) {
    fs.mkdirSync(projectRoot, { recursive: true });
  }

  const requirementsRoot = path.join(projectRoot, "requirements", "backlog");
  fs.mkdirSync(requirementsRoot, { recursive: true });

  const now = new Date().toISOString();
  const metadata: ProjectMetadata = {
    name,
    status: "backlog",
    domain,
    createdAt: now,
    updatedAt: now
  };
  fs.writeFileSync(path.join(projectRoot, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");

  const indexRaw = fs.readFileSync(workspace.indexPath, "utf-8");
  const index = JSON.parse(indexRaw) as WorkspaceIndex;
  index.projects = index.projects ?? [];
  index.projects.push({ name, status: "backlog" });
  fs.writeFileSync(workspace.indexPath, JSON.stringify(index, null, 2), "utf-8");

  return metadata;
}

export function updateProjectStatus(workspace: WorkspaceInfo, name: string, status: string): void {
  ensureWorkspace(workspace);
  const indexRaw = fs.readFileSync(workspace.indexPath, "utf-8");
  const index = JSON.parse(indexRaw) as WorkspaceIndex;
  index.projects = index.projects ?? [];
  const existing = index.projects.find((project) => project.name === name);
  if (existing) {
    existing.status = status;
  } else {
    index.projects.push({ name, status });
  }
  fs.writeFileSync(workspace.indexPath, JSON.stringify(index, null, 2), "utf-8");

  const projectRoot = path.join(workspace.root, name);
  const metadataPath = path.join(projectRoot, "metadata.json");
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8")) as ProjectMetadata;
    metadata.status = status;
    metadata.updatedAt = new Date().toISOString();
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }
}
