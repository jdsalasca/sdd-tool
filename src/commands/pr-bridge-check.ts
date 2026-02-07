import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { findRequirementDir } from "./gen-utils";
import { printError } from "../errors";

type PrLink = {
  prId?: string;
  prDir?: string;
  requirementDir?: string;
  copiedArtifacts?: string[];
  linkedAt?: string;
};

export async function runPrBridgeCheck(): Promise<void> {
  const projectName = await askProjectName();
  if (!projectName) {
    printError("SDD-1331", "Project name is required.");
    return;
  }
  const reqId = await ask("Requirement ID (REQ-...): ");
  if (!reqId) {
    printError("SDD-1332", "Requirement ID is required.");
    return;
  }

  const requirementDir = findRequirementDir(projectName, reqId);
  if (!requirementDir) {
    printError("SDD-1333", `Requirement not found: ${reqId}`);
    return;
  }

  const linksPath = path.join(requirementDir, "pr-links.json");
  if (!fs.existsSync(linksPath)) {
    printError("SDD-1334", "No pr-links.json found for this requirement.");
    return;
  }

  let links: PrLink[] = [];
  try {
    links = JSON.parse(fs.readFileSync(linksPath, "utf-8")) as PrLink[];
  } catch {
    printError("SDD-1335", "Unable to parse pr-links.json.");
    return;
  }

  const checks = links.map((link) => {
    const prId = link.prId || "unknown";
    const prDir = link.prDir || "";
    const bridgeDir = path.join(requirementDir, "pr-review", prId);
    const prDirExists = prDir.length > 0 && fs.existsSync(prDir);
    const bridgeExists = fs.existsSync(bridgeDir);
    const copiedArtifacts = Array.isArray(link.copiedArtifacts) ? link.copiedArtifacts : [];
    const missingArtifacts = copiedArtifacts.filter((name) => !fs.existsSync(path.join(bridgeDir, name)));
    return {
      prId,
      prDir,
      prDirExists,
      bridgeDir,
      bridgeExists,
      missingArtifacts,
      ok: prDirExists && bridgeExists && missingArtifacts.length === 0
    };
  });

  const okCount = checks.filter((item) => item.ok).length;
  const report = {
    requirement: reqId,
    checkedAt: new Date().toISOString(),
    total: checks.length,
    ok: okCount,
    failed: checks.length - okCount,
    checks
  };
  fs.writeFileSync(path.join(requirementDir, "pr-bridge-integrity.json"), JSON.stringify(report, null, 2), "utf-8");

  const lines = [
    `# PR Bridge Integrity: ${reqId}`,
    "",
    `- Total links: ${report.total}`,
    `- OK: ${report.ok}`,
    `- Failed: ${report.failed}`,
    "",
    "## Details"
  ];
  checks.forEach((item) => {
    lines.push(
      `- ${item.prId}: ok=${item.ok} prDirExists=${item.prDirExists} bridgeExists=${item.bridgeExists} missingArtifacts=${item.missingArtifacts.join(", ") || "none"}`
    );
  });
  fs.writeFileSync(path.join(requirementDir, "pr-bridge-integrity.md"), `${lines.join("\n")}\n`, "utf-8");

  if (report.failed > 0) {
    printError("SDD-1336", `Bridge integrity failed for ${report.failed} linked PR(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`PR bridge integrity OK for ${reqId}.`);
}
