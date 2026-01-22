import fs from "fs";
import path from "path";
import { ensureProject, getProjectInfo, getWorkspaceInfo } from "../workspace/index";

export type PrContext = {
  projectName: string;
  prId: string;
  prDir: string;
};

function extractPrId(link: string): string | null {
  const match = link.match(/\/pull\/(\d+)/i);
  if (match) {
    return `PR-${match[1]}`;
  }
  return null;
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ensurePrReviewDir(projectName: string, prLink: string, prIdInput?: string): PrContext {
  const workspace = getWorkspaceInfo();
  const project = getProjectInfo(workspace, projectName);
  ensureProject(workspace, project.name, "software");

  const derived = extractPrId(prLink);
  const rawId = prIdInput?.trim() || derived || `PR-${Date.now()}`;
  const prId = sanitizeId(rawId);

  const prDir = path.join(project.root, "pr-reviews", prId);
  if (!fs.existsSync(prDir)) {
    fs.mkdirSync(prDir, { recursive: true });
  }

  return { projectName: project.name, prId, prDir };
}

export function resolvePrDir(projectName: string, prId: string): string {
  const workspace = getWorkspaceInfo();
  const project = getProjectInfo(workspace, projectName);
  return path.join(project.root, "pr-reviews", prId);
}

export function listPrReviews(projectName: string): string[] {
  const workspace = getWorkspaceInfo();
  const project = getProjectInfo(workspace, projectName);
  const root = path.join(project.root, "pr-reviews");
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
