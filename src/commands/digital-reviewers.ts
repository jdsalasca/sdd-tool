import fs from "fs";
import path from "path";
import type { LifecycleContext } from "./app-lifecycle";

type ReviewerFinding = {
  reviewer: string;
  severity: "high" | "medium";
  message: string;
};

export type UserStory = {
  id: string;
  priority: "P0" | "P1";
  persona: string;
  story: string;
  acceptanceCriteria: string[];
  sourceReviewer: string;
};

export type DigitalReviewResult = {
  passed: boolean;
  findings: ReviewerFinding[];
  diagnostics: string[];
  score: number;
  threshold: number;
  summary: string;
};

export type ValueStoryInput = {
  goalText?: string;
  domain?: string;
  round: number;
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

function hasAccessibilityEvidence(root: string, readme: string): boolean {
  if (/\ba11y\b|\baccessibility\b|\bwcag\b|\bkeyboard\b/.test(readme)) {
    return true;
  }
  return Boolean(findDoc(root, ["accessibility.md", "a11y.md"]));
}

function hasPerformanceEvidence(root: string, readme: string): boolean {
  if (/\bperformance\b|\blatency\b|\bthroughput\b|\bp95\b|\bp99\b/.test(readme)) {
    return true;
  }
  return Boolean(findDoc(root, ["performance.md", "performance-budget.md", "scalability.md"]));
}

function hasSupportEvidence(root: string, readme: string): boolean {
  if (/\btroubleshoot\b|\bsupport\b|\bfaq\b/.test(readme)) {
    return true;
  }
  return Boolean(findDoc(root, ["troubleshooting.md", "support.md", "faq.md"]));
}

function hasApiContracts(root: string): boolean {
  return Boolean(findDoc(root, ["openapi.yaml", "openapi.yml", "api-contract.md", "api.md"]));
}

function hasReleaseNotes(root: string): boolean {
  return Boolean(findDoc(root, ["release-notes.md", "changelog.md"]));
}

function hasSmokeVerification(root: string): boolean {
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
      if (pkg.scripts?.smoke || pkg.scripts?.["test:smoke"] || pkg.scripts?.e2e) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return Boolean(findDoc(root, ["smoke.md", "smoke-tests.md", "smoke.http", "smoke-curl.sh", "smoke.ps1"]));
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

  if (totalTests < 10) {
    findings.push({
      reviewer: "qa_engineer",
      severity: "high",
      message: `Automated test depth is low (${totalTests}). Minimum expected is 10 tests for acceptance.`
    });
  }
  if (!hasSmokeVerification(appDir)) {
    findings.push({
      reviewer: "qa_engineer",
      severity: "high",
      message: "Smoke verification is missing. Add executable smoke script and local validation evidence."
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
  if (!hasAccessibilityEvidence(appDir, readme)) {
    findings.push({
      reviewer: "accessibility_tester",
      severity: "medium",
      message: "Accessibility evidence missing. Add keyboard/contrast/screen-reader validation notes."
    });
  }
  if (!hasPerformanceEvidence(appDir, readme)) {
    findings.push({
      reviewer: "performance_engineer",
      severity: "medium",
      message: "Performance expectations are unclear. Add performance budget and baseline measurements."
    });
  }
  if (!hasSupportEvidence(appDir, readme)) {
    findings.push({
      reviewer: "support_agent",
      severity: "medium",
      message: "Support/troubleshooting guidance is missing for operators and end users."
    });
  }
  if (!hasApiContracts(appDir)) {
    findings.push({
      reviewer: "integrator_partner",
      severity: "medium",
      message: "API contract/documentation missing. Add OpenAPI or API contract document for integrators."
    });
  }
  if (!hasReleaseNotes(appDir)) {
    findings.push({
      reviewer: "release_manager",
      severity: "medium",
      message: "Release notes/changelog missing. Add release documentation for change visibility."
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

function slugReviewer(reviewer: string): string {
  return reviewer.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function acceptanceCriteriaFromFinding(finding: ReviewerFinding): string[] {
  const base = finding.message.replace(/\.$/, "");
  return [
    `Given the generated app, when quality review runs, then ${base.toLowerCase()}.`,
    "Given CI validation, when documentation/tests are checked, then evidence is discoverable and actionable."
  ];
}

export function convertFindingsToUserStories(findings: ReviewerFinding[]): UserStory[] {
  const deduped = new Map<string, ReviewerFinding>();
  for (const finding of findings) {
    const key = `${finding.reviewer}::${finding.message}`.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, finding);
    }
  }
  let index = 1;
  return [...deduped.values()].map((finding) => {
    const id = `US-${String(index).padStart(3, "0")}`;
    index += 1;
    const persona = slugReviewer(finding.reviewer);
    const priority: "P0" | "P1" = finding.severity === "high" ? "P0" : "P1";
    return {
      id,
      priority,
      persona,
      sourceReviewer: finding.reviewer,
      story: `As a ${persona}, I need ${finding.message.toLowerCase()} so that the delivery is production-ready.`,
      acceptanceCriteria: acceptanceCriteriaFromFinding(finding)
    };
  });
}

export function storiesToDiagnostics(stories: UserStory[]): string[] {
  return stories.map((story) => `[UserStory:${story.id}][${story.priority}] ${story.story}`);
}

export function generateValueGrowthStories(input: ValueStoryInput): UserStory[] {
  const domain = normalizeText(input.domain ?? "software");
  const base: UserStory[] = [
    {
      id: `VG-${input.round}-01`,
      priority: "P1",
      persona: "product_owner",
      sourceReviewer: "value_growth",
      story: "As a product_owner, I need one high-value feature enhancement that improves daily user outcomes.",
      acceptanceCriteria: [
        "Feature is discoverable in UI/API.",
        "README and release notes document the new value and usage."
      ]
    },
    {
      id: `VG-${input.round}-02`,
      priority: "P1",
      persona: "quality_lead",
      sourceReviewer: "value_growth",
      story: "As a quality_lead, I need regression and smoke coverage updated for the latest feature changes.",
      acceptanceCriteria: [
        "Smoke checks pass in local environment.",
        "Regression tests cover new and impacted flows."
      ]
    }
  ];
  if (domain === "legal") {
    base.push({
      id: `VG-${input.round}-03`,
      priority: "P1",
      persona: "compliance_owner",
      sourceReviewer: "value_growth",
      story: "As a compliance_owner, I need compliance matrix updates for any new capability added this round.",
      acceptanceCriteria: ["Compliance mapping is updated and traceable to controls."]
    });
  } else if (domain === "business") {
    base.push({
      id: `VG-${input.round}-03`,
      priority: "P1",
      persona: "business_owner",
      sourceReviewer: "value_growth",
      story: "As a business_owner, I need measurable KPI impact documented for this iteration.",
      acceptanceCriteria: ["Release notes include KPI baseline/target for new capability."]
    });
  }
  return base;
}

export function writeUserStoriesBacklog(appDir: string, stories: UserStory[]): string | null {
  if (!fs.existsSync(appDir)) {
    return null;
  }
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const jsonPath = path.join(deployDir, "digital-review-user-stories.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: stories.length,
        stories
      },
      null,
      2
    ),
    "utf-8"
  );
  const mdPath = path.join(deployDir, "digital-review-user-stories.md");
  const lines = [
    "# Digital Review User Stories",
    "",
    ...stories.flatMap((story) => [
      `## ${story.id} (${story.priority})`,
      `- Persona: ${story.persona}`,
      `- Source reviewer: ${story.sourceReviewer}`,
      `- Story: ${story.story}`,
      "- Acceptance criteria:",
      ...story.acceptanceCriteria.map((criterion) => `  - ${criterion}`),
      ""
    ])
  ];
  fs.writeFileSync(mdPath, `${lines.join("\n")}\n`, "utf-8");
  return jsonPath;
}

export function appendDigitalReviewRound(
  appDir: string,
  round: number,
  review: DigitalReviewResult,
  stories: UserStory[]
): string | null {
  if (!fs.existsSync(appDir)) {
    return null;
  }
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const reportPath = path.join(deployDir, "digital-review-rounds.json");
  const existing = fs.existsSync(reportPath)
    ? (JSON.parse(fs.readFileSync(reportPath, "utf-8")) as { rounds?: unknown[] })
    : { rounds: [] };
  const rounds = Array.isArray(existing.rounds) ? existing.rounds : [];
  rounds.push({
    round,
    generatedAt: new Date().toISOString(),
    summary: review.summary,
    passed: review.passed,
    score: review.score,
    threshold: review.threshold,
    findings: review.findings,
    stories
  });
  fs.writeFileSync(reportPath, JSON.stringify({ rounds }, null, 2), "utf-8");
  return reportPath;
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
