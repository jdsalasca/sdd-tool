import fs from "fs";
import os from "os";
import path from "path";

type JsonObject = Record<string, unknown>;

function resolveBaseDir(appName: string): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, appName);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  const xdg = process.env.XDG_STATE_HOME || process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim().length > 0) {
    return path.join(xdg.trim(), appName);
  }
  return path.join(os.homedir(), ".local", "state", appName);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function resolveStateFile(relativePath: string, appName = "sdd-cli"): string {
  const base = resolveBaseDir(appName);
  ensureDir(base);
  const normalized = relativePath.replace(/^[/\\]+/, "");
  return path.join(base, normalized);
}

export function readStateJson<T extends JsonObject>(relativePath: string, fallback: T, appName = "sdd-cli"): T {
  const file = resolveStateFile(relativePath, appName);
  if (!fs.existsSync(file)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as T;
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function writeStateJson(relativePath: string, value: JsonObject, appName = "sdd-cli"): void {
  const file = resolveStateFile(relativePath, appName);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}

