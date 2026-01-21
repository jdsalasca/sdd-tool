import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { formatList, parseList } from "../utils/list";
import { createLearnSession, updateLearnSession } from "./learn-utils";

export async function runLearnStart(): Promise<void> {
  const projectName = await ask("Project name: ");
  const topic = await ask("Topic to learn: ");
  if (!projectName || !topic) {
    console.log("Project name and topic are required.");
    return;
  }

  const purpose = await ask("Why do you want to learn this? ");
  const depth = await ask("Depth (overview/academic/expert): ");
  const format = await ask("Preferred format (summary/syllabus/report/Q&A): ");
  const focusAreas = await ask("Focus areas - comma separated: ");
  const timeAvailable = await ask("Time available: ");
  const constraints = await ask("Constraints - comma separated: ");

  let created;
  try {
    created = createLearnSession(projectName, topic, "learning");
  } catch (error) {
    console.log((error as Error).message);
    return;
  }
  updateLearnSession(projectName, created.session.id, {
    purpose: purpose || "N/A",
    depth: depth || "N/A",
    format: format || "N/A",
    focusAreas: parseList(focusAreas),
    timeAvailable: timeAvailable || "N/A",
    constraints: parseList(constraints)
  });
  const sessionDir = created.dir;

  const brief = `# Brief: ${topic}\n\n${purpose || "N/A"}\n`;
  const deepDive = `# Deep Dive: ${topic}\n\nDepth: ${depth || "N/A"}\n\nFocus areas:\n${formatList(focusAreas)}\n`;
  const readingList = `# Reading List: ${topic}\n\n${formatList("TBD")}\n`;
  const qa = `# Q&A: ${topic}\n\n${formatList("TBD")}\n`;
  const sessionMd = [
    `# Learning Session: ${topic}`,
    "",
    `- Purpose: ${purpose || "N/A"}`,
    `- Depth: ${depth || "N/A"}`,
    `- Format: ${format || "N/A"}`,
    `- Focus areas:`,
    `${formatList(focusAreas)}`,
    `- Time available: ${timeAvailable || "N/A"}`,
    `- Constraints:`,
    `${formatList(constraints)}`
  ].join("\n");

  fs.writeFileSync(path.join(sessionDir, "brief.md"), brief, "utf-8");
  fs.writeFileSync(path.join(sessionDir, "deep-dive.md"), deepDive, "utf-8");
  fs.writeFileSync(path.join(sessionDir, "reading-list.md"), readingList, "utf-8");
  fs.writeFileSync(path.join(sessionDir, "qa.md"), qa, "utf-8");
  fs.writeFileSync(path.join(sessionDir, "session.md"), sessionMd, "utf-8");

  const progressLog = path.join(sessionDir, "progress-log.md");
  if (!fs.existsSync(progressLog)) {
    fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
  }
  const logEntry = `\n- ${new Date().toISOString()} started learning session ${created.session.id}\n`;
  fs.appendFileSync(progressLog, logEntry, "utf-8");

  console.log(`Learning session created at ${sessionDir}`);
}
