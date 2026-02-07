import fs from "fs";
import path from "path";
import { ask, askProjectName } from "../ui/prompt";
import { listPrReviews, resolvePrDir } from "./pr-utils";
import { printError } from "../errors";

type ParsedResponse = {
  file: string;
  severity: string;
  decision: string;
};

function parseResponseFile(filePath: string): ParsedResponse | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const severityMatch = raw.match(/- Severity:\s*([^\n\r]+)/i);
  const decisionMatch = raw.match(/- Decision:\s*([^\n\r]+)/i);
  if (!severityMatch && !decisionMatch) {
    return null;
  }
  return {
    file: path.basename(filePath),
    severity: (severityMatch?.[1] || "unknown").trim().toLowerCase(),
    decision: (decisionMatch?.[1] || "unknown").trim().toLowerCase()
  };
}

export async function runPrRisk(): Promise<void> {
  const projectName = await askProjectName();
  if (!projectName) {
    printError("SDD-1321", "Project name is required.");
    return;
  }

  let available: string[] = [];
  try {
    available = listPrReviews(projectName);
  } catch (error) {
    printError("SDD-1322", (error as Error).message);
    return;
  }
  if (available.length > 0) {
    console.log("Available PR reviews:");
    available.forEach((item) => console.log(`- ${item}`));
  }

  const prId = await ask("PR ID: ");
  if (!prId) {
    printError("SDD-1323", "PR ID is required.");
    return;
  }

  let prDir: string;
  try {
    prDir = resolvePrDir(projectName, prId);
  } catch (error) {
    printError("SDD-1324", (error as Error).message);
    return;
  }
  if (!fs.existsSync(prDir)) {
    printError("SDD-1325", `PR review not found at ${prDir}`);
    return;
  }

  const responsesDir = path.join(prDir, "responses");
  if (!fs.existsSync(responsesDir)) {
    printError("SDD-1326", "No responses directory found. Run `pr respond` first.");
    return;
  }

  const responseFiles = fs
    .readdirSync(responsesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(responsesDir, entry.name));

  const parsed = responseFiles
    .map((filePath) => parseResponseFile(filePath))
    .filter((item): item is ParsedResponse => Boolean(item));

  const severityCounts = parsed.reduce<Record<string, number>>((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});
  const decisionCounts = parsed.reduce<Record<string, number>>((acc, item) => {
    acc[item.decision] = (acc[item.decision] || 0) + 1;
    return acc;
  }, {});
  const unresolved = parsed.filter((item) => ["defer", "disagree", "unknown"].includes(item.decision));

  const riskJson = {
    prId,
    generatedAt: new Date().toISOString(),
    responsesAnalyzed: parsed.length,
    severityCounts,
    decisionCounts,
    unresolved: unresolved.map((item) => ({ file: item.file, severity: item.severity, decision: item.decision }))
  };
  fs.writeFileSync(path.join(prDir, "pr-risk-summary.json"), JSON.stringify(riskJson, null, 2), "utf-8");

  const lines = [
    `# PR Risk Summary: ${prId}`,
    "",
    `- Responses analyzed: ${parsed.length}`,
    `- Blocker: ${severityCounts.blocker || 0}`,
    `- High: ${severityCounts.high || 0}`,
    `- Medium: ${severityCounts.medium || 0}`,
    `- Low: ${severityCounts.low || 0}`,
    `- Unresolved comments: ${unresolved.length}`,
    "",
    "## Unresolved details"
  ];
  if (unresolved.length === 0) {
    lines.push("- None");
  } else {
    unresolved.forEach((item) => {
      lines.push(`- ${item.file}: severity=${item.severity}, decision=${item.decision}`);
    });
  }
  fs.writeFileSync(path.join(prDir, "pr-risk-summary.md"), `${lines.join("\n")}\n`, "utf-8");

  console.log(`PR risk summary written to ${path.join(prDir, "pr-risk-summary.md")}`);
}
