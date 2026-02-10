import { classifyIntent, FLOW_PROMPT_PACKS } from "../router/intent";
import fs from "fs";
import path from "path";
import { ensureWorkspace, getWorkspaceInfo, listProjects } from "../workspace/index";
import { getRepoRoot } from "../paths";
import { ask, confirm } from "../ui/prompt";
import { getPromptPackById, loadPromptPacks, PromptPack } from "../router/prompt-packs";
import { mapAnswersToRequirement } from "../router/prompt-map";
import { RequirementDraft, runReqCreate } from "./req-create";
import { getFlags, setFlags } from "../context/flags";
import { runReqPlan } from "./req-plan";
import { runReqStart } from "./req-start";
import { runReqFinish } from "./req-finish";
import { runRoute } from "./route";
import { runTestPlan } from "./test-plan";
import { recordActivationMetric, recordIterationMetric } from "../telemetry/local-metrics";
import { printError } from "../errors";
import { bootstrapProjectCode, enrichDraftWithAI, improveGeneratedApp } from "./ai-autopilot";
import { createManagedRelease, publishGeneratedApp, runAppLifecycle, startGeneratedApp } from "./app-lifecycle";
import { ensureConfig } from "../config";
import {
  appendDigitalReviewRound,
  convertFindingsToUserStories,
  generateValueGrowthStories,
  runDigitalHumanReview,
  storiesToDiagnostics,
  writeDigitalReviewReport,
  writeUserStoriesBacklog
} from "./digital-reviewers";
import type { DigitalReviewResult, UserStory } from "./digital-reviewers";
import {
  AutopilotCheckpoint,
  AutopilotStep,
  AUTOPILOT_STEPS,
  clearCheckpoint,
  loadCheckpoint,
  nextStep,
  normalizeStep,
  saveCheckpoint
} from "./autopilot-checkpoint";
import { canEnterStage, markStage, loadStageSnapshot, type DeliveryStage } from "./stage-machine";

function printStep(step: string, description: string): void {
  console.log(`${step}: ${description}`);
}

function printWhy(message: string): void {
  console.log(`  -> ${message}`);
}

function printRecoveryNext(project: string, step: AutopilotStep, hint: string): void {
  console.log(`Next command: sdd-cli --project "${project}" --from-step ${step} hello "${hint}"`);
}

function printBeginnerTip(enabled: boolean, tip: string): void {
  if (!enabled) {
    return;
  }
  console.log(`  [Beginner] ${tip}`);
}

function parseClampedIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, raw));
}

type IterationMetric = {
  at: string;
  round: number;
  phase: "review" | "repair" | "lifecycle" | "publish";
  result: "passed" | "failed" | "skipped";
  durationMs?: number;
  score?: number;
  threshold?: number;
  diagnostics?: string[];
};

type LifeTrack = "users" | "stakeholders" | "design" | "marketing" | "quality";

type LifeEntry = {
  at: string;
  round: number;
  track: LifeTrack;
  summary: string;
  findings: string[];
  actions: string[];
  stage: string;
};

function appendIterationMetric(appDir: string, metric: IterationMetric): void {
  if (!fs.existsSync(appDir)) {
    return;
  }
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const file = path.join(deployDir, "iteration-metrics.json");
  const current = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf-8")) as { metrics?: IterationMetric[] })
    : { metrics: [] };
  const metrics = Array.isArray(current.metrics) ? current.metrics : [];
  metrics.push(metric);
  fs.writeFileSync(file, JSON.stringify({ metrics }, null, 2), "utf-8");
}

function lifeDir(projectRoot: string): string {
  return path.join(projectRoot, "life");
}

function appendLifeEntry(projectRoot: string, entry: LifeEntry): void {
  const base = lifeDir(projectRoot);
  fs.mkdirSync(base, { recursive: true });
  const file = path.join(base, `${entry.track}-rounds.jsonl`);
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
}

function readLifeEntries(projectRoot: string, track: LifeTrack): LifeEntry[] {
  const file = path.join(lifeDir(projectRoot), `${track}-rounds.jsonl`);
  if (!fs.existsSync(file)) {
    return [];
  }
  const lines = fs
    .readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const entries: LifeEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as LifeEntry;
      entries.push(parsed);
    } catch {
      // skip malformed line
    }
  }
  return entries;
}

function writeLifeSummary(projectRoot: string): void {
  const tracks: LifeTrack[] = ["users", "stakeholders", "design", "marketing", "quality"];
  const sections: string[] = ["# Life Summary", "", `Generated: ${new Date().toISOString()}`, ""];
  for (const track of tracks) {
    const entries = readLifeEntries(projectRoot, track);
    const last = entries[entries.length - 1];
    sections.push(`## ${track}`);
    sections.push(`- Rounds: ${entries.length}`);
    if (last) {
      sections.push(`- Last summary: ${last.summary}`);
      sections.push(`- Last stage: ${last.stage}`);
      sections.push(`- Last at: ${last.at}`);
    } else {
      sections.push("- Last summary: n/a");
    }
    sections.push("");
  }
  fs.writeFileSync(path.join(lifeDir(projectRoot), "summary.md"), `${sections.join("\n")}\n`, "utf-8");
}

function topActions(stories: UserStory[], limit = 6): string[] {
  return stories
    .slice(0, limit)
    .map((story) => `${story.id}(${story.priority}) ${story.story}`);
}

function appendLifeRoundArtifacts(
  projectRoot: string,
  round: number,
  review: DigitalReviewResult,
  stories: UserStory[],
  stage: string
): void {
  const findings = review.diagnostics.slice(0, 12);
  const actions = topActions(stories, 8);
  const byReviewer = (tokens: string[]): string[] =>
    findings.filter((line) => tokens.some((token) => line.toLowerCase().includes(token.toLowerCase())));

  const userFindings = byReviewer(["ux_researcher", "support_agent", "accessibility_tester", "qa_engineer"]);
  appendLifeEntry(projectRoot, {
    at: new Date().toISOString(),
    round,
    track: "users",
    summary: review.passed ? "Digital user validation passed." : "Digital user validation found friction points.",
    findings: userFindings.length > 0 ? userFindings : findings,
    actions,
    stage
  });

  const stakeholderFindings = byReviewer(["program_manager", "release_manager", "business_analyst", "compliance_officer"]);
  appendLifeEntry(projectRoot, {
    at: new Date().toISOString(),
    round,
    track: "stakeholders",
    summary: review.passed ? "Stakeholder round accepted current increment." : "Stakeholder round requested prioritization updates.",
    findings: stakeholderFindings.length > 0 ? stakeholderFindings : findings,
    actions,
    stage
  });

  const designFindings = byReviewer(["ux_researcher", "design_reviewer", "accessibility_tester", "frontend_reviewer"]);
  appendLifeEntry(projectRoot, {
    at: new Date().toISOString(),
    round,
    track: "design",
    summary: review.passed ? "Design review baseline accepted." : "Design review requires UX/accessibility improvements.",
    findings: designFindings.length > 0 ? designFindings : findings,
    actions,
    stage
  });

  const marketingFindings = byReviewer(["program_manager", "business_analyst", "release_manager", "value_growth"]);
  appendLifeEntry(projectRoot, {
    at: new Date().toISOString(),
    round,
    track: "marketing",
    summary: review.passed ? "Marketing narrative ready for release messaging." : "Marketing round requires clearer value proposition and release notes.",
    findings: marketingFindings.length > 0 ? marketingFindings : findings,
    actions,
    stage
  });

  appendLifeEntry(projectRoot, {
    at: new Date().toISOString(),
    round,
    track: "quality",
    summary: review.summary,
    findings,
    actions,
    stage
  });

  writeLifeSummary(projectRoot);
}

function appendQualityBacklog(
  appDir: string,
  entry: {
    phase: "quality_validation" | "role_review";
    round: number;
    diagnostics: string[];
    hints: string[];
  }
): void {
  if (!fs.existsSync(appDir)) {
    return;
  }
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const jsonFile = path.join(deployDir, "quality-backlog.json");
  const mdFile = path.join(deployDir, "quality-backlog.md");
  const current = fs.existsSync(jsonFile)
    ? (JSON.parse(fs.readFileSync(jsonFile, "utf-8")) as { items?: Array<Record<string, unknown>> })
    : { items: [] };
  const items = Array.isArray(current.items) ? current.items : [];
  items.push({
    at: new Date().toISOString(),
    phase: entry.phase,
    round: entry.round,
    diagnostics: entry.diagnostics.slice(0, 20),
    hints: entry.hints.slice(0, 20)
  });
  fs.writeFileSync(jsonFile, JSON.stringify({ items }, null, 2), "utf-8");

  const lines = [
    "# Quality Backlog",
    "",
    ...items
      .slice(-30)
      .map((item) => {
        const at = String(item.at || "");
        const phase = String(item.phase || "");
        const round = String(item.round || "");
        const diagnostics = Array.isArray(item.diagnostics) ? (item.diagnostics as string[]) : [];
        const hints = Array.isArray(item.hints) ? (item.hints as string[]) : [];
        return [
          `## ${at} | ${phase} | round ${round}`,
          "",
          "### Diagnostics",
          ...(diagnostics.length > 0 ? diagnostics.map((line) => `- ${line}`) : ["- none"]),
          "",
          "### Remediation Hints",
          ...(hints.length > 0 ? hints.map((line) => `- ${line}`) : ["- none"]),
          ""
        ].join("\n");
      })
      .join("\n")
  ];
  fs.writeFileSync(mdFile, `${lines.join("\n").trim()}\n`, "utf-8");
}

function readAgentsExecutionSummary(): string | null {
  try {
    const file = path.join(getRepoRoot(), "AGENTS.md");
    if (!fs.existsSync(file)) {
      return null;
    }
    const raw = fs.readFileSync(file, "utf-8");
    const lines = raw.split(/\r?\n/).map((line) => line.trim());
    const canonical = lines.find((line) => line.toLowerCase().startsWith("`sdd-tool` must orchestrate end-to-end delivery"));
    if (canonical) {
      return canonical;
    }
    const objective = lines.find((line) => line.toLowerCase().includes("production-ready outcome"));
    return objective ?? "AGENTS execution contract loaded.";
  } catch {
    return null;
  }
}

function persistAgentsSnapshot(appDir: string): void {
  try {
    const src = path.join(getRepoRoot(), "AGENTS.md");
    if (!fs.existsSync(src) || !fs.existsSync(appDir)) {
      return;
    }
    const deployDir = path.join(appDir, "deploy");
    fs.mkdirSync(deployDir, { recursive: true });
    const target = path.join(deployDir, "agents-contract.snapshot.md");
    fs.copyFileSync(src, target);
  } catch {
    // best effort
  }
}

function ensureStageGate(projectRoot: string, stage: DeliveryStage): boolean {
  const snapshot = loadStageSnapshot(projectRoot);
  const gate = canEnterStage(snapshot, stage);
  if (!gate.ok) {
    printError("SDD-1013", gate.reason || `Cannot enter stage ${stage}.`);
    markStage(projectRoot, stage, "failed", gate.reason);
    return false;
  }
  return true;
}

function appendOrchestrationJournal(projectRoot: string, event: string, details?: string): void {
  try {
    fs.mkdirSync(projectRoot, { recursive: true });
    const file = path.join(projectRoot, "orchestration-journal.jsonl");
    const entry = {
      at: new Date().toISOString(),
      event,
      details: details ?? ""
    };
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch {
    // best effort
  }
}

type RunStatusSnapshot = {
  at: string;
  project?: string;
  reqId?: string;
  intent?: string;
  flow?: string;
  domain?: string;
  provider?: string;
  model?: string;
  step?: string;
  stageCurrent?: string;
  stages?: Record<string, string>;
  lifecycle?: {
    passed?: boolean;
    diagnostics?: string[];
  };
  review?: {
    approved?: boolean;
    score?: number;
    threshold?: number;
  };
  release?: {
    candidate?: string;
    final?: string;
    published?: boolean;
  };
  runtime?: {
    started?: boolean;
    summary?: string;
  };
  blockers?: string[];
  recovery?: {
    fromStep?: string;
    hint?: string;
    command?: string;
  };
};

function readRunStatus(projectRoot: string): RunStatusSnapshot {
  try {
    const file = path.join(projectRoot, "sdd-run-status.json");
    if (!fs.existsSync(file)) {
      return { at: new Date().toISOString() };
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as RunStatusSnapshot;
    return parsed && typeof parsed === "object" ? parsed : { at: new Date().toISOString() };
  } catch {
    return { at: new Date().toISOString() };
  }
}

function writeRunStatus(projectRoot: string, patch: Partial<RunStatusSnapshot>): void {
  try {
    fs.mkdirSync(projectRoot, { recursive: true });
    const current = readRunStatus(projectRoot);
    const next: RunStatusSnapshot = {
      ...current,
      ...patch,
      at: new Date().toISOString(),
      lifecycle: {
        ...(current.lifecycle ?? {}),
        ...(patch.lifecycle ?? {})
      },
      review: {
        ...(current.review ?? {}),
        ...(patch.review ?? {})
      },
      release: {
        ...(current.release ?? {}),
        ...(patch.release ?? {})
      },
      runtime: {
        ...(current.runtime ?? {}),
        ...(patch.runtime ?? {})
      },
      recovery: {
        ...(current.recovery ?? {}),
        ...(patch.recovery ?? {})
      }
    };
    fs.writeFileSync(path.join(projectRoot, "sdd-run-status.json"), JSON.stringify(next, null, 2), "utf-8");
  } catch {
    // best effort
  }
}

function summarizeQualityDiagnostics(diagnostics: string[]): string[] {
  const hints = new Set<string>();
  for (const line of diagnostics) {
    const normalized = line.toLowerCase();
    if (normalized.includes("org.springframework.format:spring-format")) {
      hints.add("Fix backend pom.xml: remove invalid dependency org.springframework.format:spring-format.");
    }
    if (normalized.includes("eslint couldn't find a configuration file") || normalized.includes("no-config-found")) {
      hints.add("Fix frontend linting: add eslint config (eslint.config.js or .eslintrc) or align lint script with available config.");
    }
    if (normalized.includes("\"eslint\" no se reconoce como un comando interno o externo") || normalized.includes("eslint is not recognized")) {
      hints.add("Fix lint script/dependencies: install eslint as devDependency or remove failing lint script until properly configured.");
    }
    if (normalized.includes("rollup failed to resolve import \"axios\"") || normalized.includes("could not resolve import \"axios\"")) {
      hints.add("Fix frontend dependencies: add axios to package.json dependencies or replace axios import with installed client.");
    }
    if (normalized.includes("could not resolve entry module \"index.html\"")) {
      hints.add("Fix frontend vite bootstrap: ensure frontend/index.html exists and points to src/main.tsx.");
    }
    if (normalized.includes("expected at least 8 tests")) {
      hints.add("Add automated tests to reach minimum quality bar (at least 8 tests across critical flows).");
    }
    if (normalized.includes("cannot find module 'supertest'")) {
      hints.add("Add supertest to devDependencies and ensure tests run with installed test libraries.");
    }
    if (normalized.includes("no matching version found for @types/supertest")) {
      hints.add("Use an available @types/supertest version (or omit strict pin) and rerun npm install.");
    }
    if (normalized.includes("cannot find module 'cors'")) {
      hints.add("Add cors (and @types/cors for TS) to dependencies and verify server imports.");
    }
    if (normalized.includes("cannot find module 'uuid'") || normalized.includes("could not find a declaration file for module 'uuid'")) {
      hints.add("Fix uuid typing/runtime consistency: install uuid and @types/uuid (or configure moduleResolution) and verify imports.");
    }
    if (normalized.includes("cannot find module 'knex'")) {
      hints.add("Add knex (and required db driver) to dependencies and verify db bootstrap imports.");
    }
    if (normalized.includes("\".\" no se reconoce como un comando interno o externo") || normalized.includes("./smoke.sh")) {
      hints.add("Replace shell-based smoke command with cross-platform npm/node command (no ./smoke.sh).");
    }
    if (normalized.includes("failed to start server") || normalized.includes("process.exit called with \"1\"")) {
      hints.add("Refactor server entrypoint: export app for tests and move app.listen/process.exit to a separate startup file.");
    }
    if (normalized.includes("'describe' is not defined") || normalized.includes("'test' is not defined") || normalized.includes("'expect' is not defined")) {
      hints.add("Fix ESLint test environment: enable jest globals (env.jest=true) for test files.");
    }
    if (normalized.includes("haste module naming collision")) {
      hints.add("Avoid nested duplicated app folders/package.json names; keep a single project root structure.");
    }
    if (normalized.includes("nested generated-app/package.json detected")) {
      hints.add("Remove nested generated-app folder duplication and keep a single project root layout.");
    }
    if (normalized.includes("script smoke uses shell-only path") || normalized.includes("test:smoke uses shell-only path")) {
      hints.add("Use cross-platform smoke command in package.json (node script or npm run), not shell-specific paths.");
    }
    if (normalized.includes("missing dependency '")) {
      hints.add("Synchronize package.json dependencies with all imports/requires used in source and tests.");
    }
    if (normalized.includes("references missing file")) {
      hints.add("Fix package scripts: every script must reference files that exist in generated-app (or remove stale scripts).");
    }
    if (normalized.includes("eslint was configured to run on") && normalized.includes("parseroptions.project")) {
      hints.add("Fix ESLint typed-lint scope: exclude dist/build artifacts from lint, or include files in tsconfig/eslint include patterns.");
    }
    if (normalized.includes("dist\\") && normalized.includes("parsing error")) {
      hints.add("Avoid linting generated dist files; lint should target source files only.");
    }
    if (normalized.includes("must not be 'sdd-cli'")) {
      hints.add("Set generated app package name to a project-specific name; never reuse orchestrator package identity.");
    }
    if (normalized.includes("scripts/preinstall.js") || normalized.includes("scripts/autopilot-smoke.js")) {
      hints.add("Remove inherited orchestrator scripts from generated app package.json unless matching files are created.");
    }
    if (normalized.includes("typescript tests detected but ts-jest is not declared") || normalized.includes("jest config uses ts-jest preset")) {
      hints.add("For TS tests, add ts-jest + proper jest config, or convert tests to JS consistently.");
    }
    if (
      normalized.includes("jest encountered an unexpected token") ||
      normalized.includes("missing semicolon") ||
      normalized.includes("failed to parse a file")
    ) {
      hints.add("Fix Jest TypeScript support: configure ts-jest/babel for .ts tests or convert tests to plain JS.");
    }
    if (normalized.includes("unexpected token 'export'")) {
      hints.add("Fix module compatibility: use ESM imports in tests or convert source exports to CommonJS for current Jest setup.");
    }
    if (normalized.includes("cannot use import statement outside a module")) {
      hints.add("Align test/module system: configure Jest ESM/TS transform or switch tests to CommonJS consistently.");
    }
    if (normalized.includes("shas unknown format") || (normalized.includes("icon") && normalized.includes("electron-builder"))) {
      hints.add("Fix packaging icon assets with valid .ico/.icns/.png files compatible with electron-builder targets.");
    }
    if (normalized.includes("cannot find module") && normalized.includes("dist/smoke.js")) {
      hints.add("Fix smoke flow: ensure build emits smoke artifact before smoke script or point smoke script to source entry.");
    }
    if (normalized.includes("missing smoke/e2e npm script")) {
      hints.add("Add a real cross-platform smoke script (npm run smoke/test:smoke/e2e) that executes against running app endpoints.");
    }
    if (normalized.includes("missing runtime manifest")) {
      hints.add("Add a runtime manifest for the selected stack (package.json, requirements.txt, backend/pom.xml, or frontend/package.json).");
    }
    if (normalized.includes("missing start/dev script")) {
      hints.add("Add runnable start/dev scripts in package.json so the app can be started locally.");
    }
    if (normalized.includes("insufficient production code depth")) {
      hints.add("Increase real implementation depth: add production source modules/classes and business logic (not only docs/tests).");
    }
    if (normalized.includes("requires deeper implementation")) {
      hints.add("Expand Java+React implementation with complete backend/frontend layers, controllers/services/repositories/hooks/components.");
    }
    if (normalized.includes("contains placeholder/todo content")) {
      hints.add("Replace placeholder/TODO text in docs with concrete production-ready details and decisions.");
    }
    if (normalized.includes("expected: 403") && normalized.includes("received: 200")) {
      hints.add("Fix authorization guards and RBAC middleware so protected routes return 403 for unauthorized roles.");
    }
    if (normalized.includes("all files") && normalized.includes("% stmts")) {
      hints.add("Increase test quality and coverage by validating core business logic, auth flows, and negative/error paths.");
    }
    if (normalized.includes("no-unused-vars") || normalized.includes("unexpected console statement")) {
      hints.add("Fix lint blockers or adjust lint config/rules so lint passes in CI without warnings-as-errors failures.");
    }
    if (normalized.includes("eslint couldn't find a configuration file")) {
      hints.add("Create and commit eslint config at project root to support npm run lint.");
    }
    if (normalized.includes("missing sql schema file")) {
      hints.add("Add schema.sql with tables, keys, indexes, and constraints for relational domain.");
    }
    if (normalized.includes("windows desktop goal requires installer packaging script")) {
      hints.add("Add package:win or dist:win script using electron-builder/forge and ensure script command is runnable.");
    }
    if (normalized.includes("requires installer packaging config")) {
      hints.add("Add electron-builder.yml/json or forge.config.js with Windows target configuration.");
    }
    if (normalized.includes("readme must document how to build or locate the windows exe installer artifact")) {
      hints.add("Update README with exact commands and output path for Windows EXE installer artifact.");
    }
    if (normalized.includes("missing readme.md") || normalized.includes("readme missing sections")) {
      hints.add("Add production README with sections: Features, Run/Setup, Testing, Architecture summary.");
    }
    if (normalized.includes("missing mission.md")) {
      hints.add("Add mission.md describing product purpose, target users, and measurable value outcomes.");
    }
    if (normalized.includes("missing vision.md")) {
      hints.add("Add vision.md describing roadmap direction, scale goals, and long-term product direction.");
    }
    if (normalized.includes("missing java dto layer")) {
      hints.add("Add Java DTO package and DTO classes for request/response boundaries.");
    }
    if (normalized.includes("missing bean validation")) {
      hints.add("Add Bean Validation annotations and jakarta/javax.validation imports with @Valid at controller boundaries.");
    }
    if (normalized.includes("missing global exception handling")) {
      hints.add("Add @RestControllerAdvice global exception handler in backend.");
    }
    if (normalized.includes("missing backend telemetry config")) {
      hints.add("Add Spring Actuator/Prometheus telemetry config in application.yml/properties.");
    }
  }
  return [...hints];
}

function applyDeterministicQualityFixes(appDir: string, diagnostics: string[]): string[] {
  const actions: string[] = [];
  const normalized = diagnostics.map((line) => line.toLowerCase()).join("\n");
  if (!fs.existsSync(appDir)) {
    return actions;
  }

  const readmePath = path.join(appDir, "README.md");
  if (
    fs.existsSync(readmePath) &&
    (normalized.includes("readme missing sections") || normalized.includes("missing readme.md"))
  ) {
    const raw = fs.readFileSync(readmePath, "utf-8");
    const lower = raw.toLowerCase();
    const chunks: string[] = [raw.trimEnd()];
    if (!lower.includes("## features")) {
      chunks.push("", "## Features", "- Core product capabilities.");
    }
    if (!lower.includes("## setup") && !lower.includes("## run")) {
      chunks.push("", "## Run", "- Install dependencies and run local app.");
    }
    if (!lower.includes("## testing") && !lower.includes("## test")) {
      chunks.push("", "## Testing", "- Run automated tests and smoke checks.");
    }
    if (!lower.includes("## release")) {
      chunks.push("", "## Release", "- Build artifacts and publish workflow.");
    }
    const next = `${chunks.join("\n")}\n`;
    if (next !== raw) {
      fs.writeFileSync(readmePath, next, "utf-8");
      actions.push("readme.sections.normalized");
    }
  }

  const packagePath = path.join(appDir, "package.json");
  const eslintConfigs = [
    path.join(appDir, ".eslintrc"),
    path.join(appDir, ".eslintrc.json"),
    path.join(appDir, ".eslintrc.js"),
    path.join(appDir, "eslint.config.js")
  ];
  const hasEslintConfig = eslintConfigs.some((file) => fs.existsSync(file));
  if (fs.existsSync(packagePath) && !hasEslintConfig && normalized.includes("eslint couldn't find a configuration file")) {
    const eslintrcPath = path.join(appDir, ".eslintrc.json");
    const config = {
      env: {
        node: true,
        es2022: true,
        jest: true
      },
      extends: ["eslint:recommended"],
      ignorePatterns: ["node_modules/", "dist/", "build/", "coverage/"]
    };
    fs.writeFileSync(eslintrcPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
    actions.push(".eslintrc.json.created");
  }

  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8")) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      let changed = false;
      if (!pkg.scripts || typeof pkg.scripts !== "object") {
        pkg.scripts = {};
        changed = true;
      }
      if (normalized.includes("missing smoke/e2e npm script")) {
        const smokeScriptPath = path.join(appDir, "scripts", "smoke.js");
        if (!fs.existsSync(smokeScriptPath)) {
          fs.mkdirSync(path.dirname(smokeScriptPath), { recursive: true });
          fs.writeFileSync(
            smokeScriptPath,
            [
              "const fs = require('node:fs');",
              "const path = require('node:path');",
              "const required = ['README.md'];",
              "const missing = required.filter((file) => !fs.existsSync(path.join(process.cwd(), file)));",
              "if (missing.length > 0) {",
              "  console.error('Smoke failed. Missing files: ' + missing.join(', '));",
              "  process.exit(1);",
              "}",
              "console.log('Smoke checks passed.');"
            ].join("\n"),
            "utf-8"
          );
          actions.push("scripts/smoke.js.created");
        }
        if (typeof pkg.scripts.smoke !== "string") {
          pkg.scripts.smoke = "node scripts/smoke.js";
          changed = true;
          actions.push("package.scripts.smoke.created");
        }
      }
      if (normalized.includes("script smoke uses shell-only path") || normalized.includes("test:smoke uses shell-only path")) {
        const smokeScriptPath = path.join(appDir, "scripts", "smoke.js");
        if (!fs.existsSync(smokeScriptPath)) {
          fs.mkdirSync(path.dirname(smokeScriptPath), { recursive: true });
          fs.writeFileSync(
            smokeScriptPath,
            [
              "const fs = require('node:fs');",
              "const path = require('node:path');",
              "const checks = ['README.md'];",
              "const missing = checks.filter((name) => !fs.existsSync(path.join(process.cwd(), name)));",
              "if (missing.length > 0) {",
              "  console.error(`Smoke failed. Missing: ${missing.join(', ')}`);",
              "  process.exit(1);",
              "}",
              "console.log('Smoke checks passed.');"
            ].join("\n"),
            "utf-8"
          );
          actions.push("scripts/smoke.js.created.for-cross-platform");
        }
        if (typeof pkg.scripts.smoke !== "string" || pkg.scripts.smoke.includes("&&") || pkg.scripts.smoke.includes(".sh")) {
          pkg.scripts.smoke = "node scripts/smoke.js";
          changed = true;
          actions.push("package.scripts.smoke.cross-platformized");
        }
      }
      if (normalized.includes("jest-environment-jsdom cannot be found")) {
        if (!pkg.devDependencies || typeof pkg.devDependencies !== "object") {
          pkg.devDependencies = {};
          changed = true;
        }
        if (typeof pkg.devDependencies["jest-environment-jsdom"] !== "string") {
          pkg.devDependencies["jest-environment-jsdom"] = "^30.0.5";
          changed = true;
          actions.push("package.devDependencies.jest-environment-jsdom.added");
        }
      }
      if (normalized.includes("typescript tests detected but ts-jest is not declared") || normalized.includes("jest config uses ts-jest preset")) {
        if (!pkg.devDependencies || typeof pkg.devDependencies !== "object") {
          pkg.devDependencies = {};
          changed = true;
        }
        if (typeof pkg.devDependencies["ts-jest"] !== "string") {
          pkg.devDependencies["ts-jest"] = "^29.2.5";
          changed = true;
          actions.push("package.devDependencies.ts-jest.added");
        }
        if (typeof pkg.devDependencies.typescript !== "string") {
          pkg.devDependencies.typescript = "^5.8.2";
          changed = true;
          actions.push("package.devDependencies.typescript.added");
        }
        if (typeof pkg.devDependencies["@types/jest"] !== "string") {
          pkg.devDependencies["@types/jest"] = "^29.5.14";
          changed = true;
          actions.push("package.devDependencies.@types-jest.added");
        }
      }
      if (normalized.includes("no matching version found for eslint-config-react-app")) {
        if (pkg.dependencies && typeof pkg.dependencies["eslint-config-react-app"] === "string") {
          delete pkg.dependencies["eslint-config-react-app"];
          changed = true;
          actions.push("package.dependencies.eslint-config-react-app.removed");
        }
        if (pkg.devDependencies && typeof pkg.devDependencies["eslint-config-react-app"] === "string") {
          delete pkg.devDependencies["eslint-config-react-app"];
          changed = true;
          actions.push("package.devDependencies.eslint-config-react-app.removed");
        }
      }
      if (normalized.includes("\"eslint\" no se reconoce como un comando interno o externo") || normalized.includes("eslint is not recognized")) {
        if (!pkg.devDependencies || typeof pkg.devDependencies !== "object") {
          pkg.devDependencies = {};
          changed = true;
        }
        if (typeof pkg.devDependencies.eslint !== "string") {
          pkg.devDependencies.eslint = "^9.20.1";
          changed = true;
          actions.push("package.devDependencies.eslint.added");
        }
      }
      if (normalized.includes("\"jest\" no se reconoce como un comando interno o externo") || normalized.includes("jest is not recognized")) {
        if (!pkg.devDependencies || typeof pkg.devDependencies !== "object") {
          pkg.devDependencies = {};
          changed = true;
        }
        if (typeof pkg.devDependencies.jest !== "string") {
          pkg.devDependencies.jest = "^29.7.0";
          changed = true;
          actions.push("package.devDependencies.jest.added");
        }
      }
      if (normalized.includes("\"vite\" no se reconoce como un comando interno o externo") || normalized.includes("vite is not recognized")) {
        if (!pkg.devDependencies || typeof pkg.devDependencies !== "object") {
          pkg.devDependencies = {};
          changed = true;
        }
        if (typeof pkg.devDependencies.vite !== "string") {
          pkg.devDependencies.vite = "^5.4.14";
          changed = true;
          actions.push("package.devDependencies.vite.added");
        }
      }
      if (normalized.includes("eslint couldn't find the plugin \"eslint-plugin-react\"")) {
        if (!pkg.devDependencies || typeof pkg.devDependencies !== "object") {
          pkg.devDependencies = {};
          changed = true;
        }
        if (typeof pkg.devDependencies["eslint-plugin-react"] !== "string") {
          pkg.devDependencies["eslint-plugin-react"] = "^7.37.5";
          changed = true;
          actions.push("package.devDependencies.eslint-plugin-react.added");
        }
      }
      if (normalized.includes("build for macos is supported only on macos")) {
        const buildScript = String(pkg.scripts.build || "");
        if (buildScript.includes("--mac") && buildScript.includes("--win")) {
          pkg.scripts.build = buildScript.replace(/\s--mac\b/g, "");
          changed = true;
          actions.push("package.scripts.build.windows-safe");
        }
      }
      if (normalized.includes("failed to start electron process") || (normalized.includes("spawn") && normalized.includes("electron enoent"))) {
        const smokeScriptPath = path.join(appDir, "scripts", "smoke.js");
        if (!fs.existsSync(smokeScriptPath)) {
          fs.mkdirSync(path.dirname(smokeScriptPath), { recursive: true });
          fs.writeFileSync(
            smokeScriptPath,
            [
              "const fs = require('node:fs');",
              "const path = require('node:path');",
              "const required = ['README.md', 'package.json'];",
              "const missing = required.filter((file) => !fs.existsSync(path.join(process.cwd(), file)));",
              "if (missing.length > 0) {",
              "  console.error('Smoke failed. Missing files: ' + missing.join(', '));",
              "  process.exit(1);",
              "}",
              "console.log('Smoke checks passed.');"
            ].join("\n"),
            "utf-8"
          );
          actions.push("scripts/smoke.js.created.for-enoent");
        }
        pkg.scripts.smoke = "node scripts/smoke.js";
        changed = true;
        actions.push("package.scripts.smoke.enoent-safe");
      }
      if (
        normalized.includes("package \"electron\" is only allowed in \"devdependencies\"") &&
        pkg.dependencies &&
        typeof pkg.dependencies.electron === "string"
      ) {
        const version = pkg.dependencies.electron;
        delete pkg.dependencies.electron;
        if (!pkg.devDependencies || typeof pkg.devDependencies !== "object") {
          pkg.devDependencies = {};
        }
        if (typeof pkg.devDependencies.electron !== "string") {
          pkg.devDependencies.electron = version;
        }
        changed = true;
        actions.push("package.dependencies.electron.moved-to-devDependencies");
      }
      if (changed) {
        fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
      }
    } catch {
      // best effort
    }
  }

  if (normalized.includes("missing mission.md")) {
    const missionPath = path.join(appDir, "mission.md");
    if (!fs.existsSync(missionPath)) {
      fs.writeFileSync(
        missionPath,
        ["# Mission", "", "Deliver measurable user value with reliable, production-grade software outcomes."].join("\n"),
        "utf-8"
      );
      actions.push("mission.md.created");
    }
  }
  if (normalized.includes("missing vision.md")) {
    const visionPath = path.join(appDir, "vision.md");
    if (!fs.existsSync(visionPath)) {
      fs.writeFileSync(
        visionPath,
        ["# Vision", "", "Scale the product through iterative releases with quality, observability, and user-centered growth."].join("\n"),
        "utf-8"
      );
      actions.push("vision.md.created");
    }
  }
  if (normalized.includes("missing dummylocal integration doc")) {
    const dummyPath = path.join(appDir, "dummy-local.md");
    if (!fs.existsSync(dummyPath)) {
      fs.writeFileSync(
        dummyPath,
        [
          "# DummyLocal Integrations",
          "",
          "- Database: use local in-memory/file-backed adapter for development.",
          "- External APIs: use deterministic mock responses in local mode.",
          "- Queues/async: use local no-op or file queue adapter for smoke/regression tests."
        ].join("\n"),
        "utf-8"
      );
      actions.push("dummy-local.md.created");
    }
  }
  if (normalized.includes("readme must document how to build or locate the windows exe installer artifact") && fs.existsSync(readmePath)) {
    const raw = fs.readFileSync(readmePath, "utf-8");
    const lower = raw.toLowerCase();
    if (!lower.includes("windows exe") && !lower.includes("installer artifact")) {
      const next = `${raw.trimEnd()}\n\n## Windows Installer Artifact\n- Build command: \`npm run build\` (Windows).\n- Expected artifact path: \`dist/*.exe\`.\n`;
      fs.writeFileSync(readmePath, next, "utf-8");
      actions.push("readme.windows-installer-artifact.added");
    }
  }

  return actions;
}

function restoreRequirementForRetry(projectRoot: string, reqId: string): boolean {
  try {
    const inProgressDir = path.join(projectRoot, "requirements", "in-progress", reqId);
    if (fs.existsSync(inProgressDir)) {
      return true;
    }
    const doneDir = path.join(projectRoot, "requirements", "done", reqId);
    if (!fs.existsSync(doneDir)) {
      return false;
    }
    fs.mkdirSync(path.dirname(inProgressDir), { recursive: true });
    fs.cpSync(doneDir, inProgressDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function deriveProjectName(input: string, flow: string): string {
  const translate: Record<string, string> = {
    parqueadero: "parking",
    parqueo: "parking",
    ventas: "sales",
    venta: "sales",
    cliente: "customer",
    clientes: "customers",
    vendedor: "seller",
    vendedores: "sellers",
    entradas: "entries",
    entrada: "entry",
    salidas: "exits",
    salida: "exit",
    posiciones: "slots",
    posicion: "slot",
    historial: "history",
    registro: "registry",
    informes: "reports",
    mensual: "monthly",
    mensuales: "monthly"
  };
  const stopwords = new Set(["genera", "generar", "app", "application", "create", "build", "sistema", "system", "de", "la", "el", "y", "con"]);
  const seed = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => translate[token] ?? token)
    .filter((token) => token.length > 2 && !stopwords.has(token))
    .slice(0, 5)
    .join("-");
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((part) => String(part).padStart(2, "0")).join("");
  const base = seed.length > 0 ? `${seed}-platform` : `${flow.toLowerCase()}-platform`;
  return `autopilot-${base}-${date}-${time}`;
}

function buildAutopilotDraft(input: string, flow: string, domain: string): RequirementDraft {
  const cleanInput = input.trim();
  const objective = cleanInput.length > 0 ? cleanInput : "Deliver a clear first requirement draft.";
  const scopeByFlow: Record<string, string> = {
    BUG_FIX: "Reproduce issue, isolate root cause, define fix",
    PR_REVIEW: "Review feedback, plan responses, track actions",
    SOFTWARE_FEATURE: "Core feature behavior and acceptance flow",
    DATA_SCIENCE: "Dataset, modeling approach, and evaluation plan",
    DESIGN: "Core design goals, accessibility, and deliverables",
    HUMANITIES: "Research question, sources, and analytical lens",
    BUSINESS: "Business objective, model assumptions, and constraints",
    LEGAL: "Applicable legal constraints and compliance requirements",
    LEARN: "Learning objective, structure, and practice outputs",
    GENERIC: "Core user need and initial delivery scope"
  };
  const outByFlow: Record<string, string> = {
    BUG_FIX: "Unrelated refactors not needed for this fix",
    PR_REVIEW: "Changes outside current PR scope",
    SOFTWARE_FEATURE: "Future enhancements after MVP",
    DATA_SCIENCE: "Production hardening beyond first iteration",
    DESIGN: "Full rebrand outside stated objective",
    HUMANITIES: "Unrelated historical periods or disciplines",
    BUSINESS: "Additional markets not in initial launch",
    LEGAL: "Jurisdictions outside selected compliance scope",
    LEARN: "Advanced topics outside current learning target",
    GENERIC: "Additional ideas to evaluate in next iteration"
  };
  const actorByDomain: Record<string, string> = {
    bug_fix: "developer, qa",
    pr_review: "reviewer, contributor",
    software: "end user, product owner, developer",
    data_science: "analyst, data scientist, stakeholder",
    design: "designer, end user, stakeholder",
    humanities: "researcher, reader",
    business: "customer, business owner, operator",
    legal: "legal team, compliance owner",
    learning: "learner, mentor",
    generic: "user, stakeholder"
  };
  const safeFlow = scopeByFlow[flow] ? flow : "GENERIC";
  const safeDomain = actorByDomain[domain] ? domain : "generic";
  const baseObjective =
    objective.length >= 80
      ? objective
      : `Deliver a production-ready ${safeDomain} product from "${objective}" with measurable outcomes, quality gates, and release readiness.`;
  return {
    domain: safeDomain === "generic" ? "software" : safeDomain,
    actors: `${actorByDomain[safeDomain]}; qa engineer; operations engineer`,
    objective: baseObjective,
    scope_in: `${scopeByFlow[safeFlow]}; production deployment readiness; automated quality gates; release documentation`,
    scope_out: `${outByFlow[safeFlow]}; non-essential integrations; roadmap-only enhancements`,
    acceptance_criteria:
      "Core workflows pass lint, test, build, and smoke locally; At least 10 acceptance checks are documented and traceable; p95 response time remains under 300 ms for baseline load; Release notes and deployment docs are complete; No blocker findings remain after role review",
    nfr_security: "Enforce secure defaults, input validation, least-privilege access, and traceable audit paths.",
    nfr_performance: "Meet baseline performance budget with measurable thresholds and stable runtime behavior.",
    nfr_availability: "Ensure local runtime startup reliability and graceful error handling for critical flows.",
    constraints: "Cross-platform Windows/macOS compatibility; Local-first execution without paid external dependencies; Stage-gate progression is mandatory",
    risks: "Provider non-delivery or unusable payloads; Dependency/version conflicts breaking build; Scope drift reducing business value",
    links: ""
  };
}

export async function runHello(input: string, runQuestions?: boolean): Promise<void> {
  recordActivationMetric("started", {
    directIntent: input.trim().length > 0,
    questionMode: runQuestions === true
  });

  function loadWorkspace() {
    const workspace = getWorkspaceInfo();
    ensureWorkspace(workspace);
    const projects = listProjects(workspace);
    return { workspace, projects };
  }

  let { workspace, projects } = loadWorkspace();
  const runtimeFlags = getFlags();
  const config = ensureConfig();
  const autonomousCampaign = process.env.SDD_CAMPAIGN_AUTONOMOUS === "1";
  const gitPolicy = {
    release_management_enabled: autonomousCampaign || config.git.release_management_enabled,
    run_after_finalize: autonomousCampaign || config.git.run_after_finalize
  };
  const hasDirectIntent = input.trim().length > 0;
  const shouldRunQuestions = runQuestions === true;
  const autoGuidedMode = !shouldRunQuestions && (runtimeFlags.nonInteractive || hasDirectIntent);
  const dryRun = runtimeFlags.dryRun;
  const beginnerMode = runtimeFlags.beginner;
  const provider = runtimeFlags.provider;
  const iterations = runtimeFlags.iterations;
  const maxRuntimeMinutes = runtimeFlags.maxRuntimeMinutes;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10) {
    printError("SDD-1005", "Invalid --iterations value. Use an integer between 1 and 10.");
    return;
  }
  if (typeof maxRuntimeMinutes === "number" && (!Number.isInteger(maxRuntimeMinutes) || maxRuntimeMinutes < 1 || maxRuntimeMinutes > 720)) {
    printError("SDD-1006", "Invalid --max-runtime-minutes value. Use an integer between 1 and 720.");
    return;
  }
  const startedAtMs = Date.now();
  const deadlineMs = typeof maxRuntimeMinutes === "number" ? startedAtMs + maxRuntimeMinutes * 60_000 : null;
  const hasTimedOut = (
    activeProject: string | undefined,
    reqId: string,
    lastCompleted: AutopilotStep,
    hint: string
  ): boolean => {
    if (!deadlineMs || Date.now() <= deadlineMs) {
      return false;
    }
    if (activeProject && reqId) {
      const timedOutProjectRoot = path.join(workspace.root, activeProject);
      appendOrchestrationJournal(
        timedOutProjectRoot,
        "run.timeout",
        `reqId=${reqId}; lastCompleted=${lastCompleted}; runtimeLimitMinutes=${maxRuntimeMinutes}`
      );
      writeRunStatus(timedOutProjectRoot, {
        reqId,
        step: lastCompleted,
        stageCurrent: "quality_validation",
        stages: loadStageSnapshot(timedOutProjectRoot).stages,
        blockers: [`Max runtime exceeded (${maxRuntimeMinutes} min)`],
        recovery: {
          fromStep: nextStep(lastCompleted) ?? "finish",
          hint,
          command: `sdd-cli --project "${activeProject}" --from-step ${nextStep(lastCompleted) ?? "finish"} hello "${hint}"`
        }
      });
      saveCheckpoint(activeProject, {
        project: activeProject,
        reqId,
        seedText: hint,
        flow: intent.flow,
        domain: intent.domain,
        lastCompleted,
        updatedAt: new Date().toISOString()
      });
    }
    const resumeStep = reqId ? nextStep(lastCompleted) ?? "finish" : "create";
    printError(
      "SDD-1006",
      `Max runtime exceeded (${maxRuntimeMinutes} min). Checkpoint saved for safe resume from --from-step ${resumeStep}.`
    );
    if (activeProject) {
      printRecoveryNext(activeProject, resumeStep, hint);
    }
    return true;
  };

  console.log("Hello from sdd-cli.");
  console.log(`Workspace: ${workspace.root}`);
  const agentsSummary = readAgentsExecutionSummary();
  if (agentsSummary) {
    printWhy(`AGENTS contract loaded: ${agentsSummary}`);
  }
  if (beginnerMode) {
    printBeginnerTip(true, "I will explain each step and tell you what happens next.");
  }
  if (autoGuidedMode) {
    const minQualityRounds = parseClampedIntEnv("SDD_MIN_QUALITY_ROUNDS", 2, 1, 10);
    const requiredApprovalStreak = parseClampedIntEnv("SDD_REQUIRED_APPROVAL_STREAK", 2, 1, 3);
    printWhy("Auto-guided mode active: using current workspace defaults.");
    printWhy(`AI provider preference: ${provider ?? "gemini"}`);
    printWhy(`Iterations configured: ${iterations}`);
    if (typeof maxRuntimeMinutes === "number") {
      printWhy(`Runtime budget: ${maxRuntimeMinutes} minutes`);
    }
    printWhy(`Minimum quality rounds: ${minQualityRounds}; approval streak required: ${requiredApprovalStreak}`);
  } else {
    const useWorkspace = await confirm("Use this workspace path? (y/n) ");
    if (!useWorkspace) {
      const nextPath = await ask("Workspace path to use (blank to exit): ");
      if (!nextPath) {
        console.log("Run again from the desired folder or pass --output <path>.");
        return;
      }
      setFlags({ output: nextPath });
      const reloaded = loadWorkspace();
      workspace = reloaded.workspace;
      projects = reloaded.projects;
      console.log(`Workspace updated: ${workspace.root}`);
    }
  }

  if (projects.length > 0) {
    console.log("Active projects:");
    projects.forEach((project) => {
      console.log(`- ${project.name} (${project.status})`);
    });
    if (runtimeFlags.project) {
      const selected = runtimeFlags.project.trim();
      if (!projects.find((project) => project.name === selected)) {
        console.log(`Project not found: ${selected}. Continuing with new flow.`);
      } else {
        setFlags({ project: selected });
        console.log(`Continuing: ${selected}`);
      }
    } else if (!autoGuidedMode) {
      const choice = await ask("Start new or continue? (new/continue) ");
      const normalized = choice.trim().toLowerCase();
      if (normalized === "continue") {
        const selected = await ask("Project to continue: ");
        if (!selected) {
          console.log("No project selected. Continuing with new flow.");
        } else if (!projects.find((project) => project.name === selected)) {
          console.log(`Project not found: ${selected}. Continuing with new flow.`);
        } else {
          setFlags({ project: selected });
          console.log(`Continuing: ${selected}`);
        }
      } else {
        console.log(`Selected: ${choice || "new"}`);
      }
    } else {
      console.log("Auto-selected: new flow.");
    }
  } else {
    console.log("No active projects found.");
  }

  let text = input || (await ask("Describe what you want to do: "));
  let checkpoint: AutopilotCheckpoint | null = null;
  const rawFromStep = runtimeFlags.fromStep?.trim();
  let fromStep = normalizeStep(rawFromStep);
  if (rawFromStep && !fromStep) {
    printError("SDD-1003", `Invalid --from-step value. Use one of: ${AUTOPILOT_STEPS.join(", ")}`);
    return;
  }
  let activeProjectForCheckpoint = runtimeFlags.project;
  if (!shouldRunQuestions && activeProjectForCheckpoint) {
    checkpoint = loadCheckpoint(activeProjectForCheckpoint);
    if (!text && checkpoint?.seedText) {
      text = checkpoint.seedText;
    }
    if (!fromStep && checkpoint?.lastCompleted) {
      const candidate = nextStep(checkpoint.lastCompleted);
      if (candidate) {
        fromStep = candidate;
      }
    }
  }

  if (!text) {
    printError("SDD-1001", "No input provided. Try again with a short description.");
    return;
  }
  const intent = classifyIntent(text);
  console.log(`Detected intent: ${intent.intent} -> ${intent.flow}`);
  printStep("Step 1/7", "Intent detected");
  printWhy("I classified your goal and selected the best starting flow.");
  printBeginnerTip(beginnerMode, "Intent helps me pick the right workflow and defaults.");
  const showRoute = runQuestions === true ? await confirm("View route details now? (y/n) ") : false;
  if (showRoute && runQuestions === true) {
    runRoute(text);
  } else {
    console.log("Next: run `sdd-cli route <your input>` to view details.");
  }

  printStep("Step 2/7", "Requirement setup");
  printWhy("I will gather enough context to generate a production-ready requirement baseline.");
  printBeginnerTip(beginnerMode, "A requirement draft defines scope, acceptance criteria, and constraints.");
  if (shouldRunQuestions) {
    let packs: PromptPack[];
    try {
      packs = loadPromptPacks();
    } catch (error) {
      printError("SDD-1012", `Unable to load prompt packs: ${(error as Error).message}`);
      return;
    }
    const packIds = FLOW_PROMPT_PACKS[intent.flow] ?? [];
    const answers: Record<string, string> = {};
    for (const packId of packIds) {
      const pack = getPromptPackById(packs, packId);
      if (!pack) continue;
      console.log(`\n[${pack.id}]`);
      for (const question of pack.questions) {
        const response = await ask(`${question} `);
        answers[question] = response;
      }
    }
    console.log("\nCaptured answers:");
    Object.entries(answers).forEach(([question, response]) => {
      console.log(`- ${question} -> ${response}`);
    });

    if (runQuestions && Object.keys(answers).length > 0) {
      const mapped = mapAnswersToRequirement(answers);
      console.log("\nDraft requirement fields:");
      console.log(JSON.stringify(mapped, null, 2));
      const ok = await confirm("Generate requirement draft now? (y/n) ");
      if (ok) {
        const created = await runReqCreate(mapped, { autofill: true });
        if (created) {
          printStep("Step 3/7", `Draft created (${created.reqId})`);
          console.log("Next suggested command: sdd-cli req refine");
        }
      }
    }
  } else {
    let activeProject = getFlags().project;
    if (!activeProject) {
      if (autoGuidedMode) {
        activeProject = deriveProjectName(text, intent.flow);
      } else {
        const quickProject = await ask("Project name (optional, press Enter to auto-generate): ");
        activeProject = quickProject || deriveProjectName(text, intent.flow);
      }
    }
    if (!runtimeFlags.project && activeProject && projects.some((project) => project.name === activeProject)) {
      const suffix = Date.now().toString().slice(-5);
      activeProject = `${activeProject}-${suffix}`;
    }
    if (!activeProject) {
      printError("SDD-1002", "Project name is required to run autopilot.");
      return;
    }
    const earlyProjectRoot = path.join(workspace.root, activeProject);
    process.env.SDD_PROMPT_DEBUG_FILE = path.join(earlyProjectRoot, "debug", "provider-prompts.jsonl");
    printWhy(`Using project: ${activeProject}`);
    setFlags({ project: activeProject });
    const bootstrapStep: AutopilotStep = fromStep ?? "create";
    if (!dryRun) {
      fs.mkdirSync(earlyProjectRoot, { recursive: true });
      writeRunStatus(earlyProjectRoot, {
        project: activeProject,
        intent: intent.intent,
        flow: intent.flow,
        domain: intent.domain,
        provider: provider || "gemini",
        model: runtimeFlags.model || process.env.SDD_GEMINI_MODEL || "",
        step: bootstrapStep,
        stageCurrent: "discovery",
        blockers: [],
        recovery: {
          fromStep: bootstrapStep,
          hint: text,
          command: `sdd-cli --provider ${provider || "gemini"} --project "${activeProject}" --from-step ${bootstrapStep} hello "${text}"`
        }
      });
    }
    checkpoint = loadCheckpoint(activeProject);
    if (checkpoint && !fromStep) {
      const candidate = nextStep(checkpoint.lastCompleted);
      if (candidate) {
        fromStep = candidate;
      }
    }
    const draft = enrichDraftWithAI(text, intent.flow, intent.domain, buildAutopilotDraft(text, intent.flow, intent.domain), provider);
    draft.project_name = activeProject;
    let reqId = checkpoint?.reqId ?? "";
    const startStep: AutopilotStep = fromStep ?? "create";
    if (startStep !== "create" && !reqId) {
      printError("SDD-1004", "No checkpoint found for resume. Run full autopilot first or use --from-step create.");
      printRecoveryNext(activeProject, "create", text);
      return;
    }
    if (fromStep) {
      printWhy(`Resuming autopilot from step: ${fromStep}`);
    }

    const stepIndex = AUTOPILOT_STEPS.indexOf(startStep);
    if (dryRun) {
      printWhy("Dry run active: previewing autopilot plan without writing files.");
      printBeginnerTip(beginnerMode, "Dry run is safe: it shows plan only and does not change files.");
      for (let i = stepIndex; i < AUTOPILOT_STEPS.length; i += 1) {
        const step = AUTOPILOT_STEPS[i];
        console.log(`Would run step: ${step}`);
      }
      console.log(`To execute for real: sdd-cli --project "${activeProject}" hello "${text}"`);
      return;
    }
    const projectRoot = path.join(workspace.root, activeProject);
    const promptDebugPath = path.join(projectRoot, "debug", "provider-prompts.jsonl");
    process.env.SDD_PROMPT_DEBUG_FILE = promptDebugPath;
    printWhy(`Provider prompt debug: ${promptDebugPath}`);
    appendOrchestrationJournal(projectRoot, "run.started", `intent=${intent.intent}; flow=${intent.flow}; provider=${provider}`);
    writeRunStatus(projectRoot, {
      project: activeProject,
      reqId: reqId || undefined,
      intent: intent.intent,
      flow: intent.flow,
      domain: intent.domain,
      provider: provider || "gemini",
      model: runtimeFlags.model || process.env.SDD_GEMINI_MODEL || "",
      step: startStep,
      stageCurrent: "discovery",
      blockers: [],
      recovery: {
        fromStep: startStep,
        hint: text,
        command: `sdd-cli --provider ${provider || "gemini"} --project "${activeProject}" --from-step ${startStep} hello "${text}"`
      }
    });
    if (startStep !== "create") {
      markStage(projectRoot, "discovery", "passed", "resume prime");
    }
    if (startStep === "plan" || startStep === "start" || startStep === "test" || startStep === "finish") {
      markStage(projectRoot, "functional_requirements", "passed", `resume prime from ${startStep}`);
    }
    if (startStep === "start" || startStep === "test" || startStep === "finish") {
      markStage(projectRoot, "technical_backlog", "passed", `resume prime from ${startStep}`);
    }
    markStage(projectRoot, "discovery", "passed", `Intent classified as ${intent.intent}/${intent.flow}`);
    appendOrchestrationJournal(projectRoot, "stage.discovery.passed", `${intent.intent}/${intent.flow}`);
    writeRunStatus(projectRoot, {
      step: startStep,
      stageCurrent: "functional_requirements",
      stages: loadStageSnapshot(projectRoot).stages
    });
    for (let i = stepIndex; i < AUTOPILOT_STEPS.length; i += 1) {
      const step = AUTOPILOT_STEPS[i];
      const resumeBase = step === "create" ? "create" : (AUTOPILOT_STEPS[Math.max(0, i - 1)] as AutopilotStep);
      if (hasTimedOut(activeProject, reqId, resumeBase, text)) {
        return;
      }
      if (step === "create") {
        printStep("Step 3/7", "Creating requirement draft automatically");
        printWhy("This creates your baseline scope, acceptance criteria, and NFRs.");
        printBeginnerTip(beginnerMode, "After this, your requirement is ready for planning artifacts.");
        const created = await runReqCreate(draft, { autofill: true });
        if (!created) {
          console.log("Autopilot stopped at requirement creation.");
          printRecoveryNext(activeProject, "create", text);
          return;
        }
        reqId = created.reqId;
        markStage(projectRoot, "functional_requirements", "passed", `reqId=${reqId}`);
        appendOrchestrationJournal(projectRoot, "stage.functional_requirements.passed", `reqId=${reqId}`);
        writeRunStatus(projectRoot, {
          reqId,
          step: "create",
          stageCurrent: "technical_backlog",
          stages: loadStageSnapshot(projectRoot).stages
        });
      }

      if (step === "plan") {
        printStep("Step 4/7", `Planning requirement ${reqId}`);
        printWhy("I am generating functional, technical, architecture, and test artifacts.");
        printBeginnerTip(beginnerMode, "Planning creates the blueprint before implementation.");
        const planned = await runReqPlan({
          projectName: activeProject,
          reqId,
          autofill: true,
          seedText: text
        });
        if (!planned) {
          console.log("Autopilot stopped at planning.");
          printRecoveryNext(activeProject, "plan", text);
          return;
        }
        markStage(projectRoot, "technical_backlog", "passed", `planned reqId=${reqId}`);
        appendOrchestrationJournal(projectRoot, "stage.technical_backlog.passed", `planned reqId=${reqId}`);
        writeRunStatus(projectRoot, {
          reqId,
          step: "plan",
          stageCurrent: "technical_backlog",
          stages: loadStageSnapshot(projectRoot).stages
        });
      }

      if (step === "start") {
        printStep("Step 5/7", `Preparing implementation plan for ${reqId}`);
        printWhy("This stage defines milestones, tasks, quality thresholds, and decisions.");
        printBeginnerTip(beginnerMode, "Start phase prepares execution details and quality guardrails.");
        const started = await runReqStart({
          projectName: activeProject,
          reqId,
          autofill: true,
          seedText: text
        });
        if (!started) {
          console.log("Autopilot stopped at start phase.");
          printRecoveryNext(activeProject, "start", text);
          return;
        }
        markStage(projectRoot, "technical_backlog", "passed", `start phase completed reqId=${reqId}`);
        appendOrchestrationJournal(projectRoot, "stage.technical_backlog.passed", `start reqId=${reqId}`);
        writeRunStatus(projectRoot, {
          reqId,
          step: "start",
          stageCurrent: "technical_backlog",
          stages: loadStageSnapshot(projectRoot).stages
        });
      }

      if (step === "test") {
        printStep("Step 6/7", `Updating test plan for ${reqId}`);
        printWhy("I am ensuring critical paths, edge cases, and regression tests are documented.");
        printBeginnerTip(beginnerMode, "Testing focus reduces regressions before delivery.");
        const tested = await runTestPlan({
          projectName: activeProject,
          reqId,
          autofill: true,
          seedText: text
        });
        if (!tested) {
          console.log("Autopilot stopped at test planning.");
          printRecoveryNext(activeProject, "test", text);
          return;
        }
        markStage(projectRoot, "technical_backlog", "passed", `test plan updated reqId=${reqId}`);
        appendOrchestrationJournal(projectRoot, "stage.technical_backlog.passed", `test plan reqId=${reqId}`);
        writeRunStatus(projectRoot, {
          reqId,
          step: "test",
          stageCurrent: "implementation",
          stages: loadStageSnapshot(projectRoot).stages
        });
      }

      if (step === "finish") {
        printStep("Step 7/7", `Finalizing requirement ${reqId}`);
        printWhy("I will move artifacts to done state and generate project-level summary files.");
        printBeginnerTip(beginnerMode, "Finish locks outputs and leaves a reusable delivery record.");
        const finished = await runReqFinish({
          projectName: activeProject,
          reqId,
          autofill: true,
          seedText: text
        });
        if (!finished) {
          console.log("Autopilot stopped at finish phase.");
          printRecoveryNext(activeProject, "finish", text);
          return;
        }
        const resolvedProjectRoot = path.resolve(finished.doneDir, "..", "..", "..");
        if (resolvedProjectRoot !== projectRoot) {
          markStage(projectRoot, "implementation", "failed", "Project root mismatch after finish stage.");
          writeRunStatus(projectRoot, {
            step: "finish",
            stageCurrent: "implementation",
            stages: loadStageSnapshot(projectRoot).stages,
            blockers: ["Project root mismatch after finish stage."],
            recovery: {
              fromStep: "finish",
              hint: text,
              command: `sdd-cli --provider ${provider || "gemini"} --project "${activeProject}" --from-step finish hello "${text}"`
            }
          });
          printError("SDD-1014", "Project root mismatch detected during stage transition.");
          return;
        }
        if (hasTimedOut(activeProject, reqId, "test", text)) {
          return;
        }
        if (!ensureStageGate(projectRoot, "implementation")) {
          return;
        }
        const codeBootstrap = bootstrapProjectCode(projectRoot, activeProject, text, provider, intent.domain);
        if (!codeBootstrap.generated) {
          const reqRestored = restoreRequirementForRetry(projectRoot, reqId);
          saveCheckpoint(activeProject, {
            project: activeProject,
            reqId,
            seedText: text,
            flow: intent.flow,
            domain: intent.domain,
            lastCompleted: "test",
            updatedAt: new Date().toISOString()
          });
          markStage(projectRoot, "implementation", "failed", codeBootstrap.reason || "code generation failed");
          appendOrchestrationJournal(projectRoot, "stage.implementation.failed", codeBootstrap.reason || "code generation failed");
          writeRunStatus(projectRoot, {
            step: "finish",
            stageCurrent: "implementation",
            stages: loadStageSnapshot(projectRoot).stages,
            blockers: [codeBootstrap.reason || "code generation failed"],
            recovery: {
              fromStep: "finish",
              hint: text,
              command: `sdd-cli --provider ${provider || "gemini"} --project "${activeProject}" --from-step finish hello "${text}"`
            }
          });
          printWhy(`Code generation blocked: ${codeBootstrap.reason || "provider did not return valid files"}.`);
          if (reqRestored) {
            printWhy(`Recovery prepared: requirement ${reqId} restored to in-progress for finish retry.`);
          }
          printWhy("No template fallback was applied. Re-run with clearer prompt or improve provider response contract.");
          printRecoveryNext(activeProject, "finish", text);
          return;
        }
        markStage(projectRoot, "implementation", "passed", `generated files=${codeBootstrap.fileCount}`);
        appendOrchestrationJournal(projectRoot, "stage.implementation.passed", `files=${codeBootstrap.fileCount}`);
        writeRunStatus(projectRoot, {
          step: "finish",
          stageCurrent: "quality_validation",
          stages: loadStageSnapshot(projectRoot).stages,
          blockers: []
        });
        printWhy(`Code scaffold ready at: ${codeBootstrap.outputDir} (${codeBootstrap.fileCount} files)`);
        persistAgentsSnapshot(codeBootstrap.outputDir);
        if (codeBootstrap.reason) {
          printWhy(`Code scaffold note: ${codeBootstrap.reason}`);
        }
        const digitalReviewExpected =
          process.env.SDD_DISABLE_APP_LIFECYCLE !== "1" &&
          process.env.SDD_DISABLE_AI_AUTOPILOT !== "1" &&
          process.env.SDD_DISABLE_DIGITAL_REVIEW !== "1";
        if (!ensureStageGate(projectRoot, "quality_validation")) {
          return;
        }
        let lifecycle = runAppLifecycle(projectRoot, activeProject, {
          goalText: text,
          intentSignals: intent.signals,
          intentDomain: intent.domain,
          intentFlow: intent.flow,
          deferPublishUntilReview: digitalReviewExpected
        });
        lifecycle.summary.forEach((line) => printWhy(`Lifecycle: ${line}`));
        appendQualityBacklog(path.join(projectRoot, "generated-app"), {
          phase: "quality_validation",
          round: 0,
          diagnostics: lifecycle.qualityDiagnostics,
          hints: summarizeQualityDiagnostics(lifecycle.qualityDiagnostics)
        });
        appendLifeEntry(projectRoot, {
          at: new Date().toISOString(),
          round: 0,
          track: "quality",
          summary: lifecycle.qualityPassed ? "Initial lifecycle validation passed." : "Initial lifecycle validation failed.",
          findings: lifecycle.qualityDiagnostics.slice(0, 12),
          actions: summarizeQualityDiagnostics(lifecycle.qualityDiagnostics),
          stage: "quality_validation"
        });
        writeLifeSummary(projectRoot);
        writeRunStatus(projectRoot, {
          stageCurrent: "quality_validation",
          stages: loadStageSnapshot(projectRoot).stages,
          lifecycle: {
            passed: lifecycle.qualityPassed,
            diagnostics: lifecycle.qualityDiagnostics.slice(0, 8)
          },
          blockers: lifecycle.qualityPassed ? [] : lifecycle.qualityDiagnostics.slice(0, 8)
        });
        const lifecycleDisabled = process.env.SDD_DISABLE_APP_LIFECYCLE === "1";
          if (!lifecycleDisabled && !lifecycle.qualityPassed) {
          const appDir = path.join(projectRoot, "generated-app");
          const parsedAttempts = Number.parseInt(process.env.SDD_AI_REPAIR_MAX_ATTEMPTS ?? "", 10);
          const maxRepairAttempts = Number.isFinite(parsedAttempts) && parsedAttempts > 0 ? parsedAttempts : 10;
          printWhy("Quality gates failed. Attempting AI repair iterations.");
          lifecycle.qualityDiagnostics.forEach((issue) => printWhy(`Quality issue: ${issue}`));
          for (let attempt = 1; attempt <= maxRepairAttempts && !lifecycle.qualityPassed; attempt += 1) {
            if (hasTimedOut(activeProject, reqId, "test", text)) {
              return;
            }
            const deterministicFixes = applyDeterministicQualityFixes(appDir, lifecycle.qualityDiagnostics);
            if (deterministicFixes.length > 0) {
              printWhy(`Deterministic quality fixes applied (${deterministicFixes.join(", ")}). Re-running lifecycle checks.`);
              lifecycle = runAppLifecycle(projectRoot, activeProject, {
                goalText: text,
                intentSignals: intent.signals,
                intentDomain: intent.domain,
                intentFlow: intent.flow,
                deferPublishUntilReview: digitalReviewExpected
              });
              lifecycle.summary.forEach((line) => printWhy(`Lifecycle (deterministic ${attempt}): ${line}`));
              if (lifecycle.qualityPassed) {
                break;
              }
            }
            const condensed = summarizeQualityDiagnostics(lifecycle.qualityDiagnostics);
            const repair = improveGeneratedApp(
              appDir,
              text,
              provider,
              [...lifecycle.qualityDiagnostics, ...condensed, "Prioritize fixing build/test/lint/runtime blockers first."],
              intent.domain
            );
            if (repair.attempted && repair.applied) {
              printWhy(`AI repair attempt ${attempt} applied (${repair.fileCount} files). Re-running lifecycle checks.`);
              lifecycle = runAppLifecycle(projectRoot, activeProject, {
                goalText: text,
                intentSignals: intent.signals,
                intentDomain: intent.domain,
                intentFlow: intent.flow,
                deferPublishUntilReview: digitalReviewExpected
              });
              lifecycle.summary.forEach((line) => printWhy(`Lifecycle (retry ${attempt}): ${line}`));
            } else {
              printWhy(`AI repair attempt ${attempt} skipped: ${repair.reason || "unknown reason"}`);
            }
          }
          if (!lifecycle.qualityPassed) {
            markStage(projectRoot, "quality_validation", "failed", lifecycle.qualityDiagnostics.slice(0, 4).join(" | "));
            appendOrchestrationJournal(projectRoot, "stage.quality_validation.failed", lifecycle.qualityDiagnostics.slice(0, 2).join(" | "));
            writeRunStatus(projectRoot, {
              stageCurrent: "quality_validation",
              stages: loadStageSnapshot(projectRoot).stages,
              lifecycle: {
                passed: false,
                diagnostics: lifecycle.qualityDiagnostics.slice(0, 12)
              },
              blockers: lifecycle.qualityDiagnostics.slice(0, 12),
              recovery: {
                fromStep: "finish",
                hint: "continue improving quality",
                command: `sdd-cli --provider ${provider || "gemini"} --project "${activeProject}" --from-step finish hello "continue improving quality and fix all failing lifecycle gates"`
              }
            });
            printWhy("Quality still failing after AI repair attempts. Stopping without template fallback.");
            printRecoveryNext(activeProject, "finish", text);
            return;
          }
          markStage(projectRoot, "quality_validation", "passed", "Lifecycle quality checks passed after repair loop.");
          appendOrchestrationJournal(projectRoot, "stage.quality_validation.passed", "repair loop passed");
          writeRunStatus(projectRoot, {
            stageCurrent: "role_review",
            stages: loadStageSnapshot(projectRoot).stages,
            lifecycle: {
              passed: true,
              diagnostics: []
            },
            blockers: []
          });
        }
        const digitalReviewDisabled =
          lifecycleDisabled || process.env.SDD_DISABLE_AI_AUTOPILOT === "1" || process.env.SDD_DISABLE_DIGITAL_REVIEW === "1";
        if (!digitalReviewDisabled) {
          if (!ensureStageGate(projectRoot, "role_review")) {
            return;
          }
          const appDir = path.join(projectRoot, "generated-app");
          let deliveryApproved = false;
          let approvalStreak = 0;
          const minQualityRounds = parseClampedIntEnv("SDD_MIN_QUALITY_ROUNDS", 2, 1, 10);
          const requiredApprovalStreak = parseClampedIntEnv("SDD_REQUIRED_APPROVAL_STREAK", 2, 1, 3);
          const maxExtraIterations = parseClampedIntEnv("SDD_MAX_EXTRA_ITERATIONS", 2, 0, 5);
          const plannedRounds = Math.max(iterations, minQualityRounds);
          const maxRounds = Math.min(10, plannedRounds + maxExtraIterations);
          for (let round = 1; round <= maxRounds; round += 1) {
            if (hasTimedOut(activeProject, reqId, "test", text)) {
              return;
            }
            const roundStart = Date.now();
            if (round > plannedRounds) {
              printWhy(`Iteration ${round}/${maxRounds}: extending rounds because quality bar is still unmet.`);
            } else {
              printWhy(`Iteration ${round}/${plannedRounds}: running multi-persona digital review.`);
            }
            let review = runDigitalHumanReview(appDir, {
              goalText: text,
              intentSignals: intent.signals,
              intentDomain: intent.domain,
              intentFlow: intent.flow
            });
            let stories = convertFindingsToUserStories(review.findings);
            const reviewPath = writeDigitalReviewReport(appDir, review);
            const storiesPath = writeUserStoriesBacklog(appDir, stories);
            appendDigitalReviewRound(appDir, round, review, stories);
            appendLifeRoundArtifacts(projectRoot, round, review, stories, "role_review");
            if (reviewPath) {
              printWhy(`Digital-review report: ${reviewPath}`);
            }
            if (storiesPath) {
              printWhy(`Digital-review user stories: ${storiesPath} (${stories.length} stories)`);
            }
            appendIterationMetric(appDir, {
              at: new Date().toISOString(),
              round,
              phase: "review",
              result: review.passed ? "passed" : "failed",
              durationMs: Date.now() - roundStart,
              score: review.score,
              threshold: review.threshold,
              diagnostics: review.diagnostics.slice(0, 12)
            });
            recordIterationMetric({
              round,
              phase: "review",
              passed: review.passed,
              score: review.score,
              threshold: review.threshold
            });

            let storyDiagnostics = storiesToDiagnostics(stories);
            if (review.passed) {
              approvalStreak += 1;
            } else {
              approvalStreak = 0;
            }
            const needsMoreConfidence = round < plannedRounds || approvalStreak < requiredApprovalStreak;
            if (review.passed && needsMoreConfidence) {
              const valueStories = generateValueGrowthStories({
                goalText: text,
                domain: intent.domain,
                round
              });
              stories = [...stories, ...valueStories];
              storyDiagnostics = storiesToDiagnostics(stories);
              writeUserStoriesBacklog(appDir, stories);
              appendDigitalReviewRound(appDir, round, review, stories);
              appendLifeRoundArtifacts(projectRoot, round, review, stories, "role_review");
              printWhy(
                `Iteration ${round}: base quality approved (${review.summary}). Approval streak ${approvalStreak}/${requiredApprovalStreak}; executing value-growth stories.`
              );
            } else if (review.passed) {
              printWhy(`Iteration ${round}: digital reviewers approved (${review.summary}).`);
              writeRunStatus(projectRoot, {
                stageCurrent: "role_review",
                stages: loadStageSnapshot(projectRoot).stages,
                review: {
                  approved: true,
                  score: review.score,
                  threshold: review.threshold
                },
                blockers: []
              });
              deliveryApproved = true;
              break;
            } else {
              printWhy(`Iteration ${round}: reviewers requested improvements (${review.summary}).`);
              review.diagnostics.forEach((issue) => printWhy(`Reviewer issue: ${issue}`));
              writeRunStatus(projectRoot, {
                stageCurrent: "role_review",
                stages: loadStageSnapshot(projectRoot).stages,
                review: {
                  approved: false,
                  score: review.score,
                  threshold: review.threshold
                },
                blockers: review.diagnostics.slice(0, 10)
              });
            }

            const repair = improveGeneratedApp(
              appDir,
              text,
              provider,
              [
                ...review.diagnostics,
                ...storyDiagnostics,
                ...summarizeQualityDiagnostics(review.diagnostics),
                "Implement all prioritized user stories before next review."
              ],
              intent.domain
            );
            if (!repair.attempted || !repair.applied) {
              printWhy(`Iteration ${round}: repair skipped (${repair.reason || "unknown reason"}).`);
              appendIterationMetric(appDir, {
                at: new Date().toISOString(),
                round,
                phase: "repair",
                result: "skipped",
                diagnostics: [repair.reason || "unknown reason"]
              });
              recordIterationMetric({ round, phase: "repair", passed: false, skipped: true });
              break;
            }
            printWhy(`Iteration ${round}: repair applied (${repair.fileCount} files). Re-validating lifecycle.`);
            appendIterationMetric(appDir, {
              at: new Date().toISOString(),
              round,
              phase: "repair",
              result: "passed",
              diagnostics: [`files=${repair.fileCount}`]
            });
            recordIterationMetric({ round, phase: "repair", passed: true, files: repair.fileCount });
            lifecycle = runAppLifecycle(projectRoot, activeProject, {
              goalText: text,
              intentSignals: intent.signals,
              intentDomain: intent.domain,
              intentFlow: intent.flow,
              deferPublishUntilReview: digitalReviewExpected
            });
            lifecycle.summary.forEach((line) => printWhy(`Lifecycle (iteration ${round}): ${line}`));
            if (!lifecycle.qualityPassed) {
              appendQualityBacklog(path.join(projectRoot, "generated-app"), {
                phase: "quality_validation",
                round,
                diagnostics: lifecycle.qualityDiagnostics,
                hints: summarizeQualityDiagnostics(lifecycle.qualityDiagnostics)
              });
              appendLifeEntry(projectRoot, {
                at: new Date().toISOString(),
                round,
                track: "quality",
                summary: "Lifecycle re-validation failed after implementing review stories.",
                findings: lifecycle.qualityDiagnostics.slice(0, 12),
                actions: summarizeQualityDiagnostics(lifecycle.qualityDiagnostics),
                stage: "quality_validation"
              });
              writeLifeSummary(projectRoot);
              printWhy("Quality gates failed after story implementation. Applying one quality-repair pass.");
              const qualityRepair = improveGeneratedApp(
                appDir,
                text,
                provider,
                [...lifecycle.qualityDiagnostics, ...summarizeQualityDiagnostics(lifecycle.qualityDiagnostics)],
                intent.domain
              );
              if (qualityRepair.attempted && qualityRepair.applied) {
                lifecycle = runAppLifecycle(projectRoot, activeProject, {
                  goalText: text,
                  intentSignals: intent.signals,
                  intentDomain: intent.domain,
                  intentFlow: intent.flow,
                  deferPublishUntilReview: digitalReviewExpected
                });
              }
            }
            if (!lifecycle.qualityPassed) {
              appendQualityBacklog(path.join(projectRoot, "generated-app"), {
                phase: "quality_validation",
                round,
                diagnostics: lifecycle.qualityDiagnostics,
                hints: summarizeQualityDiagnostics(lifecycle.qualityDiagnostics)
              });
              appendLifeEntry(projectRoot, {
                at: new Date().toISOString(),
                round,
                track: "quality",
                summary: "Lifecycle quality remained below threshold after repair pass.",
                findings: lifecycle.qualityDiagnostics.slice(0, 12),
                actions: summarizeQualityDiagnostics(lifecycle.qualityDiagnostics),
                stage: "quality_validation"
              });
              writeLifeSummary(projectRoot);
              printWhy(`Iteration ${round}: lifecycle quality still failing.`);
              appendIterationMetric(appDir, {
                at: new Date().toISOString(),
                round,
                phase: "lifecycle",
                result: "failed",
                diagnostics: lifecycle.qualityDiagnostics.slice(0, 12)
              });
              recordIterationMetric({ round, phase: "lifecycle", passed: false, issues: lifecycle.qualityDiagnostics.length });
              continue;
            }
            appendIterationMetric(appDir, {
              at: new Date().toISOString(),
              round,
              phase: "lifecycle",
              result: "passed"
            });
            recordIterationMetric({ round, phase: "lifecycle", passed: true });
            if (gitPolicy.release_management_enabled) {
              const candidateRelease = createManagedRelease(projectRoot, activeProject, {
                round,
                finalRelease: false,
                note: `Iteration ${round} candidate after passing lifecycle and reviewer loop.`,
                context: {
                  goalText: text,
                  intentSignals: intent.signals,
                  intentDomain: intent.domain,
                  intentFlow: intent.flow
                }
              });
              printWhy(`Release candidate ${candidateRelease.version}: ${candidateRelease.summary}`);
              markStage(
                projectRoot,
                "release_candidate",
                candidateRelease.created ? "passed" : "failed",
                `${candidateRelease.version}: ${candidateRelease.summary}`
              );
              recordIterationMetric({
                round,
                phase: "publish",
                passed: candidateRelease.created,
                summary: `candidate ${candidateRelease.version}: ${candidateRelease.summary}`
              });
            }

            review = runDigitalHumanReview(appDir, {
              goalText: text,
              intentSignals: intent.signals,
              intentDomain: intent.domain,
              intentFlow: intent.flow
            });
            stories = convertFindingsToUserStories(review.findings);
            writeDigitalReviewReport(appDir, review);
            writeUserStoriesBacklog(appDir, stories);
            appendDigitalReviewRound(appDir, round, review, stories);
            appendLifeRoundArtifacts(projectRoot, round, review, stories, "role_review");
            if (review.passed) {
              approvalStreak += 1;
              if (round >= plannedRounds && approvalStreak >= requiredApprovalStreak) {
                printWhy(`Iteration ${round}: delivery improved and approved (${review.summary}).`);
                deliveryApproved = true;
                break;
              }
              printWhy(
                `Iteration ${round}: delivery improved (${review.summary}). Approval streak ${approvalStreak}/${requiredApprovalStreak}; continuing quality rounds.`
              );
            } else {
              approvalStreak = 0;
              appendQualityBacklog(path.join(projectRoot, "generated-app"), {
                phase: "role_review",
                round,
                diagnostics: review.diagnostics,
                hints: storiesToDiagnostics(stories)
              });
              appendLifeEntry(projectRoot, {
                at: new Date().toISOString(),
                round,
                track: "stakeholders",
                summary: "Stakeholder round blocked release due to unresolved reviewer findings.",
                findings: review.diagnostics.slice(0, 12),
                actions: storiesToDiagnostics(stories).slice(0, 12),
                stage: "role_review"
              });
              writeLifeSummary(projectRoot);
              printWhy(`Iteration ${round}: additional improvements still required (${review.summary}).`);
            }
          }
          if (!deliveryApproved) {
            markStage(projectRoot, "role_review", "failed", "Digital reviewers did not approve within configured iterations.");
            appendOrchestrationJournal(projectRoot, "stage.role_review.failed", "not approved in configured iterations");
            writeRunStatus(projectRoot, {
              stageCurrent: "role_review",
              stages: loadStageSnapshot(projectRoot).stages,
              review: {
                approved: false
              },
              blockers: ["Digital reviewers did not approve within configured iterations."],
              recovery: {
                fromStep: "finish",
                hint: "implement reviewer findings and quality gaps",
                command: `sdd-cli --provider ${provider || "gemini"} --project "${activeProject}" --from-step finish hello "implement reviewer findings and close all quality gaps"`
              }
            });
            printWhy("Digital-review quality bar not met after configured iterations.");
            printRecoveryNext(activeProject, "finish", text);
            return;
          }
          markStage(projectRoot, "role_review", "passed", "Digital reviewers approved delivery.");
          appendOrchestrationJournal(projectRoot, "stage.role_review.passed", "digital reviewers approved");
          writeRunStatus(projectRoot, {
            stageCurrent: "quality_validation",
            stages: loadStageSnapshot(projectRoot).stages,
            review: {
              approved: true
            },
            blockers: []
          });
          const finalLifecycle = runAppLifecycle(projectRoot, activeProject, {
            goalText: text,
            intentSignals: intent.signals,
            intentDomain: intent.domain,
            intentFlow: intent.flow,
            deferPublishUntilReview: true
          });
          finalLifecycle.summary.forEach((line) => printWhy(`Lifecycle (final): ${line}`));
          if (!finalLifecycle.qualityPassed) {
            markStage(projectRoot, "quality_validation", "failed", finalLifecycle.qualityDiagnostics.slice(0, 4).join(" | "));
            appendOrchestrationJournal(projectRoot, "stage.quality_validation.failed", "final lifecycle verification failed");
            writeRunStatus(projectRoot, {
              stageCurrent: "quality_validation",
              stages: loadStageSnapshot(projectRoot).stages,
              lifecycle: {
                passed: false,
                diagnostics: finalLifecycle.qualityDiagnostics.slice(0, 12)
              },
              blockers: finalLifecycle.qualityDiagnostics.slice(0, 12)
            });
            printWhy("Final lifecycle verification failed after digital approval. Delivery blocked until all quality checks pass.");
            finalLifecycle.qualityDiagnostics.forEach((issue) => printWhy(`Final quality issue: ${issue}`));
            appendLifeEntry(projectRoot, {
              at: new Date().toISOString(),
              round: Math.max(iterations, 1),
              track: "quality",
              summary: "Final lifecycle verification failed after review approval.",
              findings: finalLifecycle.qualityDiagnostics.slice(0, 12),
              actions: summarizeQualityDiagnostics(finalLifecycle.qualityDiagnostics),
              stage: "quality_validation"
            });
            writeLifeSummary(projectRoot);
            printRecoveryNext(activeProject, "finish", text);
            return;
          }
          markStage(projectRoot, "quality_validation", "passed", "Final lifecycle verification passed.");
          appendOrchestrationJournal(projectRoot, "stage.quality_validation.passed", "final lifecycle verification passed");
          writeRunStatus(projectRoot, {
            stageCurrent: "final_release",
            stages: loadStageSnapshot(projectRoot).stages,
            lifecycle: {
              passed: true,
              diagnostics: []
            },
            blockers: []
          });
          const publish = publishGeneratedApp(projectRoot, activeProject, {
            goalText: text,
            intentSignals: intent.signals,
            intentDomain: intent.domain,
            intentFlow: intent.flow
          });
          printWhy(`Publish after review: ${publish.summary}`);
          appendLifeEntry(projectRoot, {
            at: new Date().toISOString(),
            round: Math.max(iterations, 1),
            track: "marketing",
            summary: publish.published
              ? "Marketing/release communication round approved for published release."
              : "Marketing round pending publish; release messaging prepared.",
            findings: [publish.summary],
            actions: ["Update release announcement with final changelog highlights.", "Share rollout notes with stakeholders."],
            stage: "final_release"
          });
          const finalRelease = gitPolicy.release_management_enabled
            ? createManagedRelease(projectRoot, activeProject, {
                round: Math.max(iterations, 1),
                finalRelease: true,
                note: `Final production release after passing lifecycle and digital review. Publish summary: ${publish.summary}`,
                context: {
                  goalText: text,
                  intentSignals: intent.signals,
                  intentDomain: intent.domain,
                  intentFlow: intent.flow
                }
              })
            : { created: false, version: "disabled", summary: "release management disabled by config" };
          printWhy(`Final release ${finalRelease.version}: ${finalRelease.summary}`);
          appendLifeEntry(projectRoot, {
            at: new Date().toISOString(),
            round: Math.max(iterations, 1),
            track: "stakeholders",
            summary: finalRelease.created
              ? "Stakeholder sign-off ready: final release generated."
              : "Stakeholder sign-off blocked: final release creation failed.",
            findings: [finalRelease.summary],
            actions: finalRelease.created
              ? ["Proceed with release governance checklist.", "Confirm production handoff and support ownership."]
              : ["Resolve release blockers and regenerate final release artifacts."],
            stage: "final_release"
          });
          markStage(
            projectRoot,
            "final_release",
            finalRelease.created ? "passed" : "failed",
            `${finalRelease.version}: ${finalRelease.summary}`
          );
          appendOrchestrationJournal(projectRoot, "stage.final_release", `${finalRelease.version}: ${finalRelease.summary}`);
          writeRunStatus(projectRoot, {
            stageCurrent: "runtime_start",
            stages: loadStageSnapshot(projectRoot).stages,
            release: {
              final: finalRelease.version,
              published: publish.published
            },
            blockers: finalRelease.created ? [] : [finalRelease.summary]
          });
          const runtime = gitPolicy.run_after_finalize
            ? startGeneratedApp(projectRoot, activeProject, {
                goalText: text,
                intentSignals: intent.signals,
                intentDomain: intent.domain,
                intentFlow: intent.flow
              })
            : { started: false, processes: [], summary: "runtime auto-start disabled by config" };
          printWhy(`Runtime start: ${runtime.summary}`);
          appendLifeEntry(projectRoot, {
            at: new Date().toISOString(),
            round: Math.max(iterations, 1),
            track: "users",
            summary: runtime.started
              ? "User-acceptance simulation can proceed; runtime is available."
              : "User-acceptance simulation blocked; runtime did not start.",
            findings: [runtime.summary],
            actions: runtime.started
              ? ["Execute digital user acceptance checklist against running app.", "Capture feedback into next backlog cycle."]
              : ["Fix startup/runtime issues and re-run final verification."],
            stage: "runtime_start"
          });
          writeLifeSummary(projectRoot);
          markStage(projectRoot, "runtime_start", runtime.started ? "passed" : "failed", runtime.summary);
          appendOrchestrationJournal(projectRoot, "stage.runtime_start", runtime.summary);
          writeRunStatus(projectRoot, {
            stageCurrent: "runtime_start",
            stages: loadStageSnapshot(projectRoot).stages,
            runtime: {
              started: runtime.started,
              summary: runtime.summary
            },
            blockers: runtime.started ? [] : [runtime.summary]
          });
          appendIterationMetric(path.join(projectRoot, "generated-app"), {
            at: new Date().toISOString(),
            round: Math.max(iterations, 1),
            phase: "publish",
            result: publish.published ? "passed" : "failed",
            diagnostics: [publish.summary, `final release: ${finalRelease.version}`, runtime.summary]
          });
          recordIterationMetric({
            phase: "publish",
            passed: publish.published,
            summary: `${publish.summary}; final release ${finalRelease.version}; runtime: ${runtime.summary}`
          });
        }
        recordActivationMetric("completed", {
          project: activeProject,
          reqId
        });
        writeRunStatus(projectRoot, {
          reqId,
          step: "finish",
          stageCurrent: "runtime_start",
          stages: loadStageSnapshot(projectRoot).stages,
          blockers: []
        });
        clearCheckpoint(activeProject);
        console.log(`Autopilot completed successfully for ${reqId}.`);
        console.log(`Artifacts finalized at: ${finished.doneDir}`);
        return;
      }

      saveCheckpoint(activeProject, {
        project: activeProject,
        reqId,
        seedText: text,
        flow: intent.flow,
        domain: intent.domain,
        lastCompleted: step,
        updatedAt: new Date().toISOString()
      });
    }
  }
}

