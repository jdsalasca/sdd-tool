import fs from "fs";
import path from "path";

export type SuiteLockHandle = { lockPath: string; pid: number };

export function isPidRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function resolveSuiteLockPath(workspaceRoot: string, projectName?: string): string {
  const cleanProject = String(projectName || "").trim();
  if (!cleanProject) {
    return path.join(workspaceRoot, ".sdd-suite-lock.json");
  }
  return path.join(workspaceRoot, cleanProject, ".sdd-suite-lock.json");
}

export function acquireSuiteLock(workspaceRoot: string, projectName?: string): SuiteLockHandle {
  const lockPath = resolveSuiteLockPath(workspaceRoot, projectName);
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    if (fs.existsSync(lockPath)) {
      const raw = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid?: number; startedAt?: string };
      const existingPid = Number(raw?.pid ?? 0);
      if (existingPid > 0 && existingPid !== process.pid && isPidRunning(existingPid)) {
        const scope = projectName ? `project=${projectName}` : "workspace";
        throw new Error(
          `Another suite process is already running (${scope}, pid=${existingPid}, startedAt=${raw?.startedAt || "unknown"}).`
        );
      }
    }
    fs.writeFileSync(
      lockPath,
      JSON.stringify(
        {
          pid: process.pid,
          startedAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf-8"
    );
    return { lockPath, pid: process.pid };
  } catch (error) {
    throw new Error(`Failed to acquire suite lock: ${(error as Error).message}`);
  }
}

export function releaseSuiteLock(handle: SuiteLockHandle | null): void {
  if (!handle) return;
  try {
    if (!fs.existsSync(handle.lockPath)) return;
    const raw = JSON.parse(fs.readFileSync(handle.lockPath, "utf-8")) as { pid?: number };
    if (Number(raw?.pid ?? 0) !== handle.pid) {
      return;
    }
    fs.rmSync(handle.lockPath, { force: true });
  } catch {
    // best effort
  }
}
