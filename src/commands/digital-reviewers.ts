import fs from "fs";
import path from "path";
import type { LifecycleContext } from "./app-lifecycle";

type ReviewerFinding = {
  reviewer: string;
  severity: "high" | "medium";
  message: string;
};

export type DigitalReviewResult = {
  passed: boolean;
  findings: ReviewerFinding[];
  diagnostics: string[];
  score: number;
  threshold: number;
  summary: string;
};

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function collectFilesRecursive(root: string, maxDepth = 8): string[] {
  const results: string[] = [];
  const walk = (current: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if ([".git", "node_modules", "dist", "build", "target", "__pycache__", ".venv", "venv"].includes(entry.name)) {
          continue;
        }
        walk(full, depth + 1);
      } else {
        results.push(rel);
      }
    }
  };
  walk(root, 0);
  return results;
}

function countTests(root: string): number {
  if (!fs.existsSync(root)) return 0;
  const files = collectFilesRecursive(root, 10).filter((rel) => /\.(jsx?|tsx?|py|java)$/i.test(rel));
  let count = 0;
  for (const rel of files) {
    const full = path.join(root, rel);
    const raw = fs.readFileSync(full, "utf-8");
    if (/\.py$/i.test(rel)) count += (raw.match(/\bdef\s+test_/g) || []).length;
    else if (/\.java$/i.test(rel)) count += (raw.match(/@Test\b/g) || []).length;
    else if (/\.test\.|\.spec\.|__tests__\//i.test(rel)) count += (raw.match(/\b(test|it)\s*\(/g) || []).length;
  }
  return count;
}

function detectDomain(context?: LifecycleContext): string {
  const hinted = normalizeText(context?.intentDomain ?? "");
  if (hinted) return hinted;
  const goal = normalizeText(context?.goalText ?? "");
  if (/\bcourt\b|\blaw\b|\bcompliance\b|\bcontract\b/.test(goal)) return "legal";
  if (/\bpricing\b|\bmarket\b|\bforecast\b|\beconomics\b/.test(goal)) return "business";
  if (/\bhistory\b|\bhumanities\b|\bphilosophy\b/.test(goal)) return "humanities";
  if (/\blearn\b|\bcourse\b|\blesson\b|\bteach\b/.test(goal)) return "learning";
  if (/\bdesign\b|\blogo\b|\bbrand\b/.test(goal)) return "design";
  if (/\bmodel\b|\bdataset\b|\bprediction\b|\bmachine learning\b|\bml\b/.test(goal)) return "data_science";
  return "software";
}

function findDoc(root: string, names: string[]): string | null {
  const files = collectFilesRecursive(root, 8).filter((rel) => rel.endsWith(".md")).map((rel) => rel.toLowerCase());
  for (const name of names) {
    const normalized = name.toLowerCase();
    const found = files.find((rel) => rel === normalized || rel.endsWith(`/${normalized}`) || rel.includes(normalized));
    if (found) return found;
  }
  return null;
}

function hasRunbookLikeReadme(readme: string): boolean {
  return /\b(run|start|setup|install)\b/.test(readme);
}

function hasUserFlowDocs(root: string, readme: string): boolean {
  if (/\buser flow\b|\bux\b|\bexperience\b|\bjourney\b/.test(readme)) {
    return true;
  }
  return Boolean(findDoc(root, ["user-flow.md", "ux-notes.md", "experience.md"]));
}

function parseThreshold(): number {
  const raw = Number.parseInt(process.env.SDD_DIGITAL_REVIEW_MIN_SCORE ?? "", 10);
  if (!Number.isFinite(raw)) {
    return 85;
  }
  return Math.max(60, Math.min(98, raw));
}

function scoreForFindings(findings: ReviewerFinding[]): number {
  let score = 100;
  for (const finding of findings) {
    score -= finding.severity === "high" ? 20 : 8;
  }
  return Math.max(0, score);
}

function hasArchitectureAndExecutionDocs(root: string): boolean {
  const architecture = findDoc(root, ["architecture.md"]);
  const execution = findDoc(root, ["execution-guide.md", "runbook.md", "operations-runbook.md"]);
  return Boolean(architecture && execution);
}

function hasLicense(root: string): boolean {
  return fs.existsSync(path.join(root, "LICENSE"));
}

function hasSecretLeak(root: string): boolean {
  const files = collectFilesRecursive(root, 8).filter((rel) => /\.(env|txt|md|json|yml|yaml|properties|ts|js|py|java)$/i.test(rel));
  const patterns = [/api[_-]?key\s*[:=]\s*[^\s]+/i, /secret\s*[:=]\s*[^\s]+/i, /password\s*[:=]\s*[^\s]+/i];
  for (const rel of files) {
    const raw = fs.readFileSync(path.join(root, rel), "utf-8");
    if (patterns.some((pattern) => pattern.test(raw))) return true;
  }
  return false;
}

export function runDigitalHumanReview(appDir: string, context?: LifecycleContext): DigitalReviewResult {
  const findings: ReviewerFinding[] = [];
  const threshold = parseThreshold();
  if (!fs.existsSync(appDir)) {
    const diagnostics = ["[DigitalReviewer:program_manager][high] Generated app directory is missing."];
    return {
      passed: false,
      findings: [{ reviewer: "program_manager", severity: "high", message: "Generated app directory is missing." }],
      diagnostics,
      score: 0,
      threshold,
      summary: "failed: app directory missing"
    };
  }

  const readmePath = path.join(appDir, "README.md");
  const readme = fs.existsSync(readmePath) ? normalizeText(fs.readFileSync(readmePath, "utf-8")) : "";
  const totalTests = countTests(appDir);
  const domain = detectDomain(context);

  if (!readme) {
    findings.push({ reviewer: "program_manager", severity: "high", message: "README.md is missing; delivery is not product-ready." });
  } else {
    if (!/\bfeatures?\b/.test(readme)) {
      findings.push({ reviewer: "program_manager", severity: "medium", message: "README must include explicit product features section." });
    }
    if (!hasRunbookLikeReadme(readme)) {
      findings.push({ reviewer: "program_manager", severity: "high", message: "README lacks clear execution instructions (run/start/setup/install)." });
    }
  }

  if (totalTests < 8) {
    findings.push({
      reviewer: "qa_engineer",
      severity: "high",
      message: `Automated test depth is low (${totalTests}). Minimum expected is 8 tests for acceptance.`
    });
  }
  if (!hasArchitectureAndExecutionDocs(appDir)) {
    findings.push({
      reviewer: "program_manager",
      severity: "medium",
      message: "Architecture and execution/runbook docs are required for production readiness."
    });
  }
  if (!hasLicense(appDir)) {
    findings.push({
      reviewer: "program_manager",
      severity: "medium",
      message: "Project should include a LICENSE file for delivery readiness."
    });
  }

  if (!hasUserFlowDocs(appDir, readme)) {
    findings.push({
      reviewer: "ux_researcher",
      severity: "medium",
      message: "User experience flow is unclear. Add user-flow/UX notes and acceptance of critical journeys."
    });
  }

  if (hasSecretLeak(appDir)) {
    findings.push({
      reviewer: "security_reviewer",
      severity: "high",
      message: "Potential secret leakage detected (api key/secret/password pattern). Remove hardcoded secrets."
    });
  }

  if (domain === "legal") {
    if (!findDoc(appDir, ["compliance-matrix.md", "compliance.md"])) {
      findings.push({ reviewer: "compliance_officer", severity: "high", message: "Legal project requires compliance matrix documentation." });
    }
    if (!findDoc(appDir, ["risk-register.md", "legal-risks.md"])) {
      findings.push({ reviewer: "compliance_officer", severity: "high", message: "Legal project requires risk register with mitigations." });
    }
  }

  if (domain === "business") {
    if (!findDoc(appDir, ["unit-economics.md", "economics.md", "financial-forecast.md"])) {
      findings.push({ reviewer: "business_analyst", severity: "high", message: "Business project requires unit-economics or financial forecast documentation." });
    }
    if (!findDoc(appDir, ["sensitivity-analysis.md", "scenario-analysis.md"])) {
      findings.push({ reviewer: "business_analyst", severity: "medium", message: "Business project should include sensitivity/scenario analysis." });
    }
  }

  if (domain === "data_science") {
    if (!findDoc(appDir, ["evaluation-metrics.md", "metrics.md"])) {
      findings.push({ reviewer: "ml_reviewer", severity: "high", message: "Data-science delivery requires evaluation metrics documentation." });
    }
    if (!findDoc(appDir, ["monitoring-plan.md", "drift-monitoring.md"])) {
      findings.push({ reviewer: "ml_reviewer", severity: "high", message: "Data-science delivery requires drift monitoring plan." });
    }
  }

  const diagnostics = findings.map((finding) => `[DigitalReviewer:${finding.reviewer}][${finding.severity}] ${finding.message}`);
  const score = scoreForFindings(findings);
  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.length - highCount;
  const passed = findings.length === 0 || (highCount === 0 && score >= threshold);
  const summary = passed
    ? `passed: score ${score}/${threshold} (high=${highCount}, medium=${mediumCount})`
    : `failed: score ${score}/${threshold} (high=${highCount}, medium=${mediumCount})`;
  return {
    passed,
    findings,
    diagnostics,
    score,
    threshold,
    summary
  };
}

export function writeDigitalReviewReport(appDir: string, review: DigitalReviewResult): string | null {
  if (!fs.existsSync(appDir)) {
    return null;
  }
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const reportPath = path.join(deployDir, "digital-review-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: review.passed,
        score: review.score,
        threshold: review.threshold,
        summary: review.summary,
        findings: review.findings,
        diagnostics: review.diagnostics
      },
      null,
      2
    ),
    "utf-8"
  );
  return reportPath;
}
