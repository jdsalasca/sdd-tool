import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { appendProgress, findRequirementDir } from "./gen-utils";
import { listPrReviews, resolvePrDir } from "./pr-utils";

type PrLinkEntry = {
  prId: string;
  prDir: string;
  requirementDir: string;
  copiedArtifacts: string[];
  linkedAt: string;
};

const PR_ARTIFACTS = [
  "review.json",
  "pr-comment-audit.md",
  "pr-comment-lifecycle.md",
  "pr-metrics.md",
  "pr-review-summary.md",
  "pr-review-report.md",
  "responses"
];

function copyPrArtifacts(prDir: string, targetDir: string): string[] {
  const copied: string[] = [];
  fs.mkdirSync(targetDir, { recursive: true });

  for (const name of PR_ARTIFACTS) {
    const source = path.join(prDir, name);
    if (!fs.existsSync(source)) {
      continue;
    }
    const target = path.join(targetDir, name);
    fs.cpSync(source, target, { recursive: true });
    copied.push(name);
  }

  return copied;
}

function upsertPrLinks(requirementDir: string, entry: PrLinkEntry): void {
  const linksPath = path.join(requirementDir, "pr-links.json");
  let links: PrLinkEntry[] = [];
  if (fs.existsSync(linksPath)) {
    try {
      const raw = fs.readFileSync(linksPath, "utf-8");
      const parsed = JSON.parse(raw) as PrLinkEntry[];
      if (Array.isArray(parsed)) {
        links = parsed;
      }
    } catch {
      links = [];
    }
  }

  const next = links.filter((item) => item.prId !== entry.prId);
  next.push(entry);
  fs.writeFileSync(linksPath, JSON.stringify(next, null, 2), "utf-8");
}

function appendChangelog(requirementDir: string, message: string): void {
  const changelogPath = path.join(requirementDir, "changelog.md");
  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(changelogPath, "# Changelog\n\n", "utf-8");
  }
  fs.appendFileSync(changelogPath, `\n- ${new Date().toISOString()} ${message}\n`, "utf-8");
}

export async function runPrBridge(): Promise<void> {
  const projectName = await askProjectName();
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

  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!reqId) {
    console.log("Requirement ID is required.");
    return;
  }

  const requirementDir = findRequirementDir(projectName, reqId);
  if (!requirementDir) {
    console.log(`Requirement not found: ${reqId}`);
    return;
  }

  const bridgeDir = path.join(requirementDir, "pr-review", prId);
  const copiedArtifacts = copyPrArtifacts(prDir, bridgeDir);
  const linkedAt = new Date().toISOString();

  upsertPrLinks(requirementDir, {
    prId,
    prDir,
    requirementDir,
    copiedArtifacts,
    linkedAt
  });

  const summary =
    copiedArtifacts.length > 0
      ? `linked PR review ${prId} into ${reqId}: ${copiedArtifacts.join(", ")}`
      : `linked PR review ${prId} into ${reqId} (no known artifacts copied)`;
  appendProgress(requirementDir, summary);
  appendChangelog(requirementDir, summary);

  console.log(`PR review ${prId} linked to requirement ${reqId}.`);
  console.log(`Bridge directory: ${bridgeDir}`);
}
