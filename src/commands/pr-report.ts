import fs from "fs";
import path from "path";
import { ask } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList } from "../utils/list";
import { listPrReviews, resolvePrDir } from "./pr-utils";

export async function runPrReport(): Promise<void> {
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
  const title = await ask("Report title: ");
  const summary = await ask("Summary: ");
  const totalComments = await ask("Total comments: ");
  const resolvedComments = await ask("Resolved comments: ");
  const openComments = await ask("Open comments: ");
  const keyDecisions = await ask("Key decisions - comma separated: ");
  const changesMade = await ask("Changes made - comma separated: ");
  const testEvidence = await ask("Test evidence - comma separated: ");
  const remainingRisks = await ask("Remaining risks - comma separated: ");

  const reportTemplate = loadTemplate("pr-review-report");
  const report = renderTemplate(reportTemplate, {
    title: title || prId,
    pr_link: prLink || "N/A",
    summary: summary || "N/A",
    total_comments: totalComments || "0",
    resolved_comments: resolvedComments || "0",
    open_comments: openComments || "0",
    key_decisions: formatList(keyDecisions),
    changes_made: formatList(changesMade),
    test_evidence: formatList(testEvidence),
    remaining_risks: formatList(remainingRisks)
  });

  fs.writeFileSync(path.join(prDir, "pr-review-report.md"), report, "utf-8");
  console.log(`PR review report written to ${path.join(prDir, "pr-review-report.md")}`);
}
