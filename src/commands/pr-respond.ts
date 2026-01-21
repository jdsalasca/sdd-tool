import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { listPrReviews, resolvePrDir } from "./pr-utils";

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function runPrRespond(): Promise<void> {
  const projectName = await ask("Project name: ");
  if (!projectName) {
    console.log("Project name is required.");
    return;
  }
  let available: string[] = [];
  try {
    available = listPrReviews(projectName);
  } catch (error) {
    console.log((error as Error).message);
    return;
  }
  if (available.length > 0) {
    console.log("Available PR reviews:");
    available.forEach((item) => console.log(`- ${item}`));
  }
  const prId = await ask("PR ID: ");
  if (!prId) {
    console.log("PR ID is required.");
    return;
  }
  let prDir: string;
  try {
    prDir = resolvePrDir(projectName, prId);
  } catch (error) {
    console.log((error as Error).message);
    return;
  }
  if (!fs.existsSync(prDir)) {
    console.log(`PR review not found at ${prDir}`);
    return;
  }

  const prLink = await ask("PR link (optional): ");
  const commentId = await ask("Comment ID: ");
  const severity = await ask("Severity (blocker/high/medium/low): ");
  const decision = await ask("Decision (accept/clarify/disagree/defer): ");
  const evidence = await ask("Evidence: ");
  const responseText = await ask("Response text: ");

  if (!commentId) {
    console.log("Comment ID is required.");
    return;
  }

  const responseTemplate = loadTemplate("pr-response-generator");
  const response = renderTemplate(responseTemplate, {
    pr_link: prLink || "N/A",
    comment_id: commentId,
    severity: severity || "N/A",
    decision: decision || "N/A",
    evidence: evidence || "N/A",
    response_text: responseText || "N/A"
  });

  const responsesDir = path.join(prDir, "responses");
  fs.mkdirSync(responsesDir, { recursive: true });
  const fileName = `${sanitizeId(commentId)}.md`;
  fs.writeFileSync(path.join(responsesDir, fileName), response, "utf-8");

  console.log(`Response saved to ${path.join(responsesDir, fileName)}`);
}
