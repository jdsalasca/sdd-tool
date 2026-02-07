import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList } from "../utils/list";
import { listPrReviews, resolvePrDir } from "./pr-utils";
import { printError } from "../errors";

export async function runPrAudit(): Promise<void> {
  const projectName = await askProjectName();
  if (!projectName) {
    printError("SDD-1346", "Project name is required.");
    return;
  }
  let available: string[] = [];
  try {
    available = listPrReviews(projectName);
  } catch (error) {
    printError("SDD-1347", (error as Error).message);
    return;
  }
  if (available.length > 0) {
    console.log("Available PR reviews:");
    available.forEach((item) => console.log(`- ${item}`));
  }
  const prId = await ask("PR ID: ");
  if (!prId) {
    printError("SDD-1348", "PR ID is required.");
    return;
  }
  let prDir: string;
  try {
    prDir = resolvePrDir(projectName, prId);
  } catch (error) {
    printError("SDD-1349", (error as Error).message);
    return;
  }
  if (!fs.existsSync(prDir)) {
    printError("SDD-1350", `PR review not found at ${prDir}`);
    return;
  }

  const prLink = await ask("PR link: ");
  const prTitle = await ask("PR title: ");
  const commentInventory = await ask("Comment inventory - comma separated: ");
  const validComments = await ask("Valid comments - comma separated: ");
  const debatableComments = await ask("Debatable comments - comma separated: ");
  const recommendedResponses = await ask("Recommended responses - comma separated: ");
  const followUps = await ask("Follow-ups - comma separated: ");
  const lifecycleEntries = await ask("Comment lifecycle entries - comma separated: ");

  const auditTemplate = loadTemplate("pr-comment-audit");
  const audit = renderTemplate(auditTemplate, {
    title: prTitle || prId,
    pr_link: prLink || "N/A",
    comment_inventory: formatList(commentInventory),
    valid_comments: formatList(validComments),
    debatable_comments: formatList(debatableComments),
    recommended_responses: formatList(recommendedResponses),
    follow_ups: formatList(followUps)
  });
  fs.writeFileSync(path.join(prDir, "pr-comment-audit.md"), audit, "utf-8");

  const lifecycleTemplate = loadTemplate("pr-comment-lifecycle");
  const lifecycle = renderTemplate(lifecycleTemplate, {
    entries: formatList(lifecycleEntries)
  });
  fs.writeFileSync(path.join(prDir, "pr-comment-lifecycle.md"), lifecycle, "utf-8");

  console.log(`PR audit updated in ${prDir}`);
}


