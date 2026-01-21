import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList } from "../utils/list";
import { listPrReviews, resolvePrDir } from "./pr-utils";

export async function runPrFinish(): Promise<void> {
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

  const prLink = await ask("PR link: ");
  const title = await ask("Review title: ");
  const commentAudit = await ask("Comment audit reference (file/path): ");
  const responses = await ask("Responses reference (file/path): ");
  const plannedFixes = await ask("Planned fixes - comma separated: ");
  const tests = await ask("Tests run - comma separated: ");

  const summaryTemplate = loadTemplate("pr-review-summary");
  const summary = renderTemplate(summaryTemplate, {
    title: title || prId,
    pr_link: prLink || "N/A",
    comment_audit: commentAudit || "pr-comment-audit.md",
    responses: responses || "responses/",
    planned_fixes: formatList(plannedFixes),
    tests: formatList(tests)
  });
  fs.writeFileSync(path.join(prDir, "pr-review-summary.md"), summary, "utf-8");

  console.log(`PR review summary written to ${path.join(prDir, "pr-review-summary.md")}`);
}
