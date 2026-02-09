import fs from "fs";
import path from "path";
import { getFlags } from "../context/flags";
import { ensureWorkspace, getWorkspaceInfo } from "../workspace/index";

type MetricsSnapshot = {
  firstSeenAt: string;
  lastSeenAt: string;
  commandCounts: Record<string, number>;
  activation: {
    started: number;
    completed: number;
  };
  events: Array<{
    at: string;
    type: string;
    data?: Record<string, string | number | boolean>;
  }>;
};

function isEnabled(): boolean {
  const flags = getFlags();
  return Boolean(flags.metricsLocal) || process.env.SDD_METRICS_LOCAL === "1";
}

function metricsPath(): string {
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);
  const dir = path.join(workspace.root, "metrics");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "local-metrics.json");
}

function loadSnapshot(filePath: string): MetricsSnapshot {
  if (!fs.existsSync(filePath)) {
    const now = new Date().toISOString();
    return {
      firstSeenAt: now,
      lastSeenAt: now,
      commandCounts: {},
      activation: { started: 0, completed: 0 },
      events: []
    };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as MetricsSnapshot;
    return {
      firstSeenAt: parsed.firstSeenAt || new Date().toISOString(),
      lastSeenAt: parsed.lastSeenAt || new Date().toISOString(),
      commandCounts: parsed.commandCounts || {},
      activation: parsed.activation || { started: 0, completed: 0 },
      events: Array.isArray(parsed.events) ? parsed.events : []
    };
  } catch {
    const now = new Date().toISOString();
    return {
      firstSeenAt: now,
      lastSeenAt: now,
      commandCounts: {},
      activation: { started: 0, completed: 0 },
      events: []
    };
  }
}

export function recordCommandMetric(command: string): void {
  if (!isEnabled()) {
    return;
  }
  const file = metricsPath();
  const snapshot = loadSnapshot(file);
  const now = new Date().toISOString();
  snapshot.lastSeenAt = now;
  snapshot.commandCounts[command] = (snapshot.commandCounts[command] || 0) + 1;
  snapshot.events.push({ at: now, type: "command", data: { command } });
  if (snapshot.events.length > 200) {
    snapshot.events = snapshot.events.slice(snapshot.events.length - 200);
  }
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf-8");
}

export function recordActivationMetric(type: "started" | "completed", data?: Record<string, string | number | boolean>): void {
  if (!isEnabled()) {
    return;
  }
  const file = metricsPath();
  const snapshot = loadSnapshot(file);
  const now = new Date().toISOString();
  snapshot.lastSeenAt = now;
  snapshot.activation[type] = (snapshot.activation[type] || 0) + 1;
  snapshot.events.push({ at: now, type: `activation.${type}`, data });
  if (snapshot.events.length > 200) {
    snapshot.events = snapshot.events.slice(snapshot.events.length - 200);
  }
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf-8");
}

export function recordIterationMetric(data: Record<string, string | number | boolean>): void {
  if (!isEnabled()) {
    return;
  }
  const file = metricsPath();
  const snapshot = loadSnapshot(file);
  const now = new Date().toISOString();
  snapshot.lastSeenAt = now;
  snapshot.events.push({ at: now, type: "autopilot.iteration", data });
  if (snapshot.events.length > 200) {
    snapshot.events = snapshot.events.slice(snapshot.events.length - 200);
  }
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf-8");
}
