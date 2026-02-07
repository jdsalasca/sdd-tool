import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { formatList, parseList } from "../utils/list";
import { listLearnSessions, loadLearnSession } from "./learn-utils";
import { printError } from "../errors";

export async function runLearnDeliver(): Promise<void> {
  const projectName = await askProjectName();
  if (!projectName) {
    printError("SDD-1731", "Project name is required.");
    return;
  }
  let sessions: string[] = [];
  try {
    sessions = listLearnSessions(projectName);
  } catch (error) {
    printError("SDD-1732", (error as Error).message);
    return;
  }
  if (sessions.length > 0) {
    console.log("Available sessions:");
    sessions.forEach((session) => console.log(`- ${session}`));
  }
  const sessionId = await ask("Session ID: ");
  if (!sessionId) {
    printError("SDD-1733", "Session ID is required.");
    return;
  }

  let loaded;
  try {
    loaded = loadLearnSession(projectName, sessionId);
  } catch (error) {
    printError("SDD-1734", (error as Error).message);
    return;
  }
  if (!loaded) {
    printError("SDD-1735", "Learning session not found.");
    return;
  }

  const brief = await ask("Brief summary: ");
  const deepDive = await ask("Deep dive notes: ");
  const readingList = await ask("Reading list - comma separated: ");
  const questions = await ask("Questions - comma separated: ");
  const answers = await ask("Answers - comma separated (aligned by order): ");

  const qList = parseList(questions);
  const aList = parseList(answers);
  const qaItems = qList.map((question, index) => {
    const answer = aList[index] ?? "TBD";
    return `- Q: ${question}\n  A: ${answer}`;
  });

  fs.writeFileSync(path.join(loaded.dir, "brief.md"), `# Brief: ${loaded.session.topic}\n\n${brief || "N/A"}\n`, "utf-8");
  fs.writeFileSync(
    path.join(loaded.dir, "deep-dive.md"),
    `# Deep Dive: ${loaded.session.topic}\n\n${deepDive || "N/A"}\n`,
    "utf-8"
  );
  fs.writeFileSync(
    path.join(loaded.dir, "reading-list.md"),
    `# Reading List: ${loaded.session.topic}\n\n${formatList(readingList)}\n`,
    "utf-8"
  );
  fs.writeFileSync(path.join(loaded.dir, "qa.md"), `# Q&A: ${loaded.session.topic}\n\n${qaItems.join("\n")}\n`, "utf-8");

  const progressLog = path.join(loaded.dir, "progress-log.md");
  if (!fs.existsSync(progressLog)) {
    fs.writeFileSync(progressLog, "# Progress Log\n\n", "utf-8");
  }
  const logEntry = `\n- ${new Date().toISOString()} delivered learning outputs for ${loaded.session.id}\n`;
  fs.appendFileSync(progressLog, logEntry, "utf-8");

  console.log(`Learning outputs written to ${loaded.dir}`);
}


