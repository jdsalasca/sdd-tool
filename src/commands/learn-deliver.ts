import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { formatList, parseList } from "../utils/list";
import { listLearnSessions, loadLearnSession } from "./learn-utils";

export async function runLearnDeliver(): Promise<void> {
  const projectName = await ask("Project name: ");
  if (!projectName) {
    console.log("Project name is required.");
    return;
  }
  const sessions = listLearnSessions(projectName);
  if (sessions.length > 0) {
    console.log("Available sessions:");
    sessions.forEach((session) => console.log(`- ${session}`));
  }
  const sessionId = await ask("Session ID: ");
  if (!sessionId) {
    console.log("Session ID is required.");
    return;
  }

  const loaded = loadLearnSession(projectName, sessionId);
  if (!loaded) {
    console.log("Learning session not found.");
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
