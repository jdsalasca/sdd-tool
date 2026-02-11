import fs from "fs";
import path from "path";
import { appendCampaignJournal, readJsonFile } from "./campaign-telemetry";
import { isPidRunning } from "./suite-lock";

/**
 * Clears stale campaign states that were left as running=true after process termination.
 */
export function sanitizeStaleCampaignStates(workspaceRoot: string): void {
  try {
    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const entry of entries) {
      const projectRoot = path.join(workspaceRoot, entry.name);
      const stateFile = path.join(projectRoot, "suite-campaign-state.json");
      if (!fs.existsSync(stateFile)) continue;
      const parsed = readJsonFile<{
        running?: boolean;
        suitePid?: number;
        phase?: string;
        lastError?: string;
      }>(stateFile);
      if (!parsed || parsed.running !== true) continue;
      const suitePid = Number(parsed.suitePid || 0);
      const alive = Number.isFinite(suitePid) && suitePid > 0 ? isPidRunning(suitePid) : false;
      if (alive) continue;
      const nextState = {
        ...parsed,
        running: false,
        phase: "stale_state_sanitized",
        lastError: parsed.lastError || "campaign marked stale because suitePid is no longer running"
      };
      fs.writeFileSync(stateFile, JSON.stringify(nextState, null, 2), "utf-8");
      appendCampaignJournal(projectRoot, "campaign.state.sanitized", `stale running=true cleared (suitePid=${suitePid || 0})`);
    }
  } catch {
    // best effort
  }
}
