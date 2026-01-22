import fs from "fs";
import path from "path";
import { ensureProject, getProjectInfo, getWorkspaceInfo } from "../workspace/index";

export type LearnSession = {
  id: string;
  topic: string;
  purpose: string;
  depth: string;
  format: string;
  focusAreas: string[];
  timeAvailable: string;
  constraints: string[];
  createdAt: string;
  updatedAt: string;
};

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createLearnSession(
  projectName: string,
  topic: string,
  domain = "learning"
): { session: LearnSession; dir: string } {
  const workspace = getWorkspaceInfo();
  const project = getProjectInfo(workspace, projectName);
  ensureProject(workspace, project.name, domain);

  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 13);
  const id = `LEARN-${sanitizeId(topic)}-${stamp}`;
  const now = new Date().toISOString();
  const session: LearnSession = {
    id,
    topic,
    purpose: "N/A",
    depth: "N/A",
    format: "N/A",
    focusAreas: [],
    timeAvailable: "N/A",
    constraints: [],
    createdAt: now,
    updatedAt: now
  };

  const sessionDir = path.join(project.root, "learning", id);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "session.json"), JSON.stringify(session, null, 2), "utf-8");

  return { session, dir: sessionDir };
}

export function loadLearnSession(projectName: string, sessionId: string): { session: LearnSession; dir: string } | null {
  const workspace = getWorkspaceInfo();
  const project = getProjectInfo(workspace, projectName);
  const sessionDir = path.join(project.root, "learning", sessionId);
  const sessionPath = path.join(sessionDir, "session.json");
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8")) as LearnSession;
  return { session, dir: sessionDir };
}

export function listLearnSessions(projectName: string): string[] {
  const workspace = getWorkspaceInfo();
  const project = getProjectInfo(workspace, projectName);
  const root = path.join(project.root, "learning");
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function updateLearnSession(projectName: string, sessionId: string, next: Partial<LearnSession>): LearnSession | null {
  const loaded = loadLearnSession(projectName, sessionId);
  if (!loaded) {
    return null;
  }
  const updated: LearnSession = {
    ...loaded.session,
    ...next,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(loaded.dir, "session.json"), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}
