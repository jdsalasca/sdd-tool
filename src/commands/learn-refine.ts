import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { formatList, parseList } from "../utils/list";
import { listLearnSessions, loadLearnSession, updateLearnSession } from "./learn-utils";
import { printError } from "../errors";

export async function runLearnRefine(): Promise<void> {
  const projectName = await askProjectName();
  if (!projectName) {
    printError("SDD-1721", "Project name is required.");
    return;
  }
  let sessions: string[] = [];
  try {
    sessions = listLearnSessions(projectName);
  } catch (error) {
    printError("SDD-1722", (error as Error).message);
    return;
  }
  if (sessions.length > 0) {
    console.log("Available sessions:");
    sessions.forEach((session) => console.log(`- ${session}`));
  }
  const sessionId = await ask("Session ID: ");
  if (!sessionId) {
    printError("SDD-1723", "Session ID is required.");
    return;
  }

  let loaded;
  try {
    loaded = loadLearnSession(projectName, sessionId);
  } catch (error) {
    printError("SDD-1724", (error as Error).message);
    return;
  }
  if (!loaded) {
    printError("SDD-1725", "Learning session not found.");
    return;
  }

  const purpose = await ask(`Purpose (${loaded.session.purpose}): `);
  const depth = await ask(`Depth (${loaded.session.depth}): `);
  const format = await ask(`Format (${loaded.session.format}): `);
  const focusAreas = await ask("Focus areas - comma separated: ");
  const timeAvailable = await ask(`Time available (${loaded.session.timeAvailable}): `);
  const constraints = await ask("Constraints - comma separated: ");

  let updated;
  try {
    updated = updateLearnSession(projectName, sessionId, {
      purpose: purpose || loaded.session.purpose,
      depth: depth || loaded.session.depth,
      format: format || loaded.session.format,
      focusAreas: focusAreas ? parseList(focusAreas) : loaded.session.focusAreas,
      timeAvailable: timeAvailable || loaded.session.timeAvailable,
      constraints: constraints ? parseList(constraints) : loaded.session.constraints
    });
  } catch (error) {
    printError("SDD-1726", (error as Error).message);
    return;
  }

  if (!updated) {
    printError("SDD-1727", "Failed to update session.");
    return;
  }

  const sessionMd = [
    `# Learning Session: ${updated.topic}`,
    "",
    `- Purpose: ${updated.purpose}`,
    `- Depth: ${updated.depth}`,
    `- Format: ${updated.format}`,
    `- Focus areas:`,
    `${formatList(updated.focusAreas.join(", "))}`,
    `- Time available: ${updated.timeAvailable}`,
    `- Constraints:`,
    `${formatList(updated.constraints.join(", "))}`
  ].join("\n");
  fs.writeFileSync(path.join(loaded.dir, "session.md"), sessionMd, "utf-8");

  const progressLog = path.join(loaded.dir, "progress-log.md");
  if (!fs.existsSync(progressLog)) {
    fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
  }
  const logEntry = `\n- ${new Date().toISOString()} refined learning session ${updated.id}\n`;
  fs.appendFileSync(progressLog, logEntry, "utf-8");
  console.log(`Learning session updated at ${loaded.dir}`);
}


