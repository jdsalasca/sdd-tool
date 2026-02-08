import fs from "fs";
import path from "path";
import { getFlags } from "../context/flags";
import { ensureConfig } from "../config";

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

export type ProjectInfo = {
  name: string;
  root: string;
};

type WorkspaceIndex = {
  projects: Array<{ name: string; status: string }>;
};

const WORKSPACE_LOCK_RETRY_MS = 50;
const WORKSPACE_LOCK_WAIT_MS = 5000;
const WORKSPACE_LOCK_STALE_MS = 30000;

export function normalizeScopeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Scope name is required.");
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Scope name cannot contain path separators.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(trimmed)) {
    throw new Error("Scope name must use letters, numbers, spaces, '-' or '_' only.");
  }
  return trimmed;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readWorkspaceIndex(workspace: WorkspaceInfo): WorkspaceIndex {
  const parsed = readJsonFile<WorkspaceIndex>(workspace.indexPath);
  if (!parsed || !Array.isArray(parsed.projects)) {
    return { projects: [] };
  }
  return { projects: parsed.projects };
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isStaleLock(lockPath: string): boolean {
  try {
    const stats = fs.statSync(lockPath);
    return Date.now() - stats.mtimeMs > WORKSPACE_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

function withWorkspaceIndexLock<T>(workspace: WorkspaceInfo, fn: () => T): T {
  const lockPath = `${workspace.indexPath}.lock`;
  const start = Date.now();

  while (true) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      try {
        const payload = JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() });
        fs.writeFileSync(fd, payload, "utf-8");
      } finally {
        fs.closeSync(fd);
      }
      break;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") {
        throw err;
      }
      if (isStaleLock(lockPath)) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() - start > WORKSPACE_LOCK_WAIT_MS) {
        throw new Error("Workspace index is locked by another process. Retry shortly.");
      }
      sleepSync(WORKSPACE_LOCK_RETRY_MS);
    }
  }

  try {
    return fn();
  } finally {
    try {
      fs.rmSync(lockPath, { force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

export function getWorkspaceInfo(): WorkspaceInfo {
  const flags = getFlags();
  const scope = flags.scope && flags.scope.trim().length > 0 ? normalizeScopeName(flags.scope) : undefined;
  return getWorkspaceInfoForScope(scope);
}

export function getWorkspaceInfoForScope(scope?: string): WorkspaceInfo {
  const baseRoot = getWorkspaceBaseRoot();
  const normalizedScope = scope && scope.trim().length > 0 ? normalizeScopeName(scope) : "";
  const root = normalizedScope ? path.join(baseRoot, normalizedScope) : baseRoot;
  const indexPath = path.join(root, "workspaces.json");
  return { root, indexPath };
}

export function getWorkspaceBaseRoot(): string {
  const flags = getFlags();
  if (flags.output) {
    return path.resolve(flags.output);
  }
  const config = ensureConfig();
  return path.resolve(config.workspace.default_root);
}

export function listScopes(baseRoot?: string): string[] {
  const root = baseRoot ? path.resolve(baseRoot) : getWorkspaceBaseRoot();
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(root, name, "workspaces.json")))
    .sort();
}

export function ensureWorkspace(workspace: WorkspaceInfo): void {
  if (!fs.existsSync(workspace.root)) {
    fs.mkdirSync(workspace.root, { recursive: true });
  }
  withWorkspaceIndexLock(workspace, () => {
    if (!fs.existsSync(workspace.indexPath)) {
      const emptyIndex: WorkspaceIndex = { projects: [] };
      fs.writeFileSync(workspace.indexPath, JSON.stringify(emptyIndex, null, 2), "utf-8");
    }
  });
}

export function normalizeProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Project name is required.");
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Project name cannot contain path separators.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(trimmed)) {
    throw new Error("Project name must use letters, numbers, spaces, '-' or '_' only.");
  }
  return trimmed;
}

export function getProjectInfo(workspace: WorkspaceInfo, name: string): ProjectInfo {
  const normalized = normalizeProjectName(name);
  const resolvedRoot = path.resolve(workspace.root);
  const projectRoot = path.resolve(workspace.root, normalized);
  const rootPrefix = `${resolvedRoot}${path.sep}`;
  if (projectRoot !== resolvedRoot && !projectRoot.startsWith(rootPrefix)) {
    throw new Error("Project name resolves outside the workspace.");
  }
  return { name: normalized, root: projectRoot };
}

export function listProjects(workspace: WorkspaceInfo): ProjectSummary[] {
  if (!fs.existsSync(workspace.indexPath)) {
    return [];
  }
  const parsed = readJsonFile<{ projects?: Array<{ name?: string; status?: string }> }>(workspace.indexPath);
  return ((parsed?.projects ?? []) as Array<{ name?: string; status?: string }>).map((project) => ({
    name: project.name ?? "unknown",
    status: project.status ?? "unknown"
  }));
}

export function ensureProject(workspace: WorkspaceInfo, name: string, domain: string): ProjectMetadata {
  ensureWorkspace(workspace);
  const project = getProjectInfo(workspace, name);
  const projectRoot = project.root;
  if (!fs.existsSync(projectRoot)) {
    fs.mkdirSync(projectRoot, { recursive: true });
  }

  const requirementsRoot = path.join(projectRoot, "requirements", "backlog");
  fs.mkdirSync(requirementsRoot, { recursive: true });

  const metadataPath = path.join(projectRoot, "metadata.json");
  let metadata: ProjectMetadata;
  if (fs.existsSync(metadataPath)) {
    const parsed = readJsonFile<ProjectMetadata>(metadataPath);
    if (parsed) {
      metadata = parsed;
    } else {
      const now = new Date().toISOString();
      metadata = {
        name: project.name,
        status: "backlog",
        domain,
        createdAt: now,
        updatedAt: now
      };
    }
  } else {
    const now = new Date().toISOString();
    metadata = {
      name: project.name,
      status: "backlog",
      domain,
      createdAt: now,
      updatedAt: now
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  withWorkspaceIndexLock(workspace, () => {
    const index = readWorkspaceIndex(workspace);
    index.projects = index.projects ?? [];
    const existing = index.projects.find((entry) => entry.name === project.name);
    if (existing) {
      existing.status = metadata.status;
    } else {
      index.projects.push({ name: metadata.name, status: metadata.status });
    }
    fs.writeFileSync(workspace.indexPath, JSON.stringify(index, null, 2), "utf-8");
  });

  return metadata;
}

export function createProject(workspace: WorkspaceInfo, name: string, domain: string): ProjectMetadata {
  return ensureProject(workspace, name, domain);
}

export function updateProjectStatus(workspace: WorkspaceInfo, name: string, status: string): void {
  ensureWorkspace(workspace);
  const project = getProjectInfo(workspace, name);
  withWorkspaceIndexLock(workspace, () => {
    const index = readWorkspaceIndex(workspace);
    index.projects = index.projects ?? [];
    const existing = index.projects.find((entry) => entry.name === project.name);
    if (existing) {
      existing.status = status;
    } else {
      index.projects.push({ name: project.name, status });
    }
    fs.writeFileSync(workspace.indexPath, JSON.stringify(index, null, 2), "utf-8");
  });

  const projectRoot = project.root;
  const metadataPath = path.join(projectRoot, "metadata.json");
  const metadata =
    fs.existsSync(metadataPath) ? readJsonFile<ProjectMetadata>(metadataPath) : null;
  if (metadata) {
    metadata.status = status;
    metadata.updatedAt = new Date().toISOString();
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }
}

