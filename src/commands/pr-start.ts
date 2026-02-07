import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { loadTemplate, renderTemplate } from "../templates/render";
import { formatList } from "../utils/list";
import { ensurePrReviewDir } from "./pr-utils";
import { printError } from "../errors";

export async function runPrStart(): Promise<void> {
  const projectName = await askProjectName();
  if (!projectName) {
    printError("SDD-1301", "Project name is required.");
    return;
  }
  const prLink = await ask("PR link: ");
  if (!prLink) {
    printError("SDD-1302", "PR link is required.");
    return;
  }
  const prIdInput = await ask("PR ID (optional): ");
  const prTitle = await ask("PR title: ");
  const approvals = await ask("Approvals - comma separated: ");
  const commentInventory = await ask("Comment inventory - comma separated: ");
  const validComments = await ask("Valid comments - comma separated: ");
  const debatableComments = await ask("Debatable comments - comma separated: ");
  const recommendedResponses = await ask("Recommended responses - comma separated: ");
  const followUps = await ask("Follow-ups - comma separated: ");
  const lifecycleEntries = await ask("Comment lifecycle entries - comma separated: ");

  const totalComments = await ask("Total comments: ");
  const blockers = await ask("Blockers: ");
  const avgTime = await ask("Avg time to resolve: ");
  const testsRun = await ask("Tests run: ");
  const notes = await ask("Notes - comma separated: ");

  let context;
  try {
    context = ensurePrReviewDir(projectName, prLink, prIdInput);
  } catch (error) {
    printError("SDD-1303", (error as Error).message);
    return;
  }
  const reviewMeta = {
    id: context.prId,
    link: prLink,
    title: prTitle || context.prId,
    status: "in-review",
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(context.prDir, "review.json"), JSON.stringify(reviewMeta, null, 2), "utf-8");

  const auditTemplate = loadTemplate("pr-comment-audit");
  const audit = renderTemplate(auditTemplate, {
    title: prTitle || context.prId,
    pr_link: prLink,
    comment_inventory: formatList(commentInventory),
    valid_comments: formatList(validComments),
    debatable_comments: formatList(debatableComments),
    recommended_responses: formatList(recommendedResponses),
    follow_ups: formatList(followUps)
  });
  fs.writeFileSync(path.join(context.prDir, "pr-comment-audit.md"), audit, "utf-8");

  const lifecycleTemplate = loadTemplate("pr-comment-lifecycle");
  const lifecycle = renderTemplate(lifecycleTemplate, {
    entries: formatList(lifecycleEntries)
  });
  fs.writeFileSync(path.join(context.prDir, "pr-comment-lifecycle.md"), lifecycle, "utf-8");

  const metricsTemplate = loadTemplate("pr-metrics");
  const metrics = renderTemplate(metricsTemplate, {
    total_comments: totalComments || "N/A",
    blockers: blockers || "N/A",
    avg_time_to_resolve: avgTime || "N/A",
    tests_run: testsRun || "N/A",
    notes: formatList(notes)
  });
  fs.writeFileSync(path.join(context.prDir, "pr-metrics.md"), metrics, "utf-8");

  const guidesDir = path.join(context.prDir, "guides");
  fs.mkdirSync(guidesDir, { recursive: true });
  const styleGuide = loadTemplate("pr-response-style");
  fs.writeFileSync(path.join(guidesDir, "pr-response-style.md"), styleGuide, "utf-8");
  const severityGuide = loadTemplate("pr-comment-severity");
  fs.writeFileSync(path.join(guidesDir, "pr-comment-severity.md"), severityGuide, "utf-8");

  console.log(`PR review initialized in ${context.prDir}`);
}


