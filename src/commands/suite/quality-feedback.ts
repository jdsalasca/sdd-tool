import fs from "fs";
import path from "path";

function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function extractQuotedValue(input: string, quote: string): string {
  const start = input.indexOf(quote);
  if (start < 0) return "";
  const end = input.indexOf(quote, start + 1);
  if (end < 0) return "";
  return input.slice(start + 1, end).trim();
}

function qualityHintsFromDiagnostics(diagnostics: string[]): string[] {
  const hints = new Set<string>();
  for (const raw of diagnostics) {
    const line = String(raw || "").trim();
    const lower = line.toLowerCase();
    if (!line) continue;
    if (lower.includes("no matching version found for eslint-config-react-app")) {
      hints.add("Remove invalid/deprecated eslint-config-react-app dependency and use a valid eslint baseline.");
    }
    if (lower.includes("invalid dependency 'jest-electron-runner")) {
      hints.add("Remove jest-electron-runner and replace desktop runtime tests with playwright/electron smoke checks.");
    }
    if (lower.includes("invalid dependency 'spectron")) {
      hints.add("Remove spectron and use modern playwright-based smoke validation.");
    }
    if (lower.includes("plugin-auto-unpackaged")) {
      hints.add("Replace invalid electron-forge plugin references with valid forge/builder configuration.");
    }
    if (lower.includes("eslint") && (lower.includes("not recognized") || lower.includes("no se reconoce"))) {
      hints.add("Ensure eslint is installed as devDependency and lint script is runnable cross-platform.");
    }
    if (lower.includes("jest") && (lower.includes("not recognized") || lower.includes("no se reconoce"))) {
      hints.add("Ensure jest is installed/configured and test script runs locally.");
    }
    if (lower.includes("vite") && (lower.includes("not recognized") || lower.includes("no se reconoce"))) {
      hints.add("Ensure vite is installed as devDependency and build scripts are valid.");
    }
    if (lower.includes("ts-jest") || lower.includes("typescript tests detected")) {
      hints.add("Add ts-jest/typescript dependencies or convert tests to JavaScript consistently.");
    }
    if (lower.includes("jest-environment-jsdom")) {
      hints.add("Add jest-environment-jsdom in devDependencies when testEnvironment is jsdom.");
    }
    if (lower.includes("missing smoke/e2e npm script")) {
      hints.add("Add a real smoke/test:smoke/e2e npm script and keep it cross-platform.");
    }
    if (lower.includes("shell-only path") || lower.includes(".sh")) {
      hints.add("Replace shell-only scripts with node/npm scripts that run on Windows and macOS.");
    }
    if (lower.includes("package \"electron\" is only allowed in \"devdependencies\"")) {
      hints.add("Move electron to devDependencies for desktop packaging compliance.");
    }
    if (lower.includes("missing readme")) {
      hints.add("Add README sections: Features, Run, Testing, Release.");
    }
    if (lower.includes("missing mission.md")) {
      hints.add("Add mission.md with concrete business objective.");
    }
    if (lower.includes("missing vision.md")) {
      hints.add("Add vision.md with growth/release direction.");
    }
    if (lower.includes("missing sql schema file")) {
      hints.add("Add schema.sql documenting relational model and constraints.");
    }
    if (lower.includes("missing backend telemetry config")) {
      hints.add("Add backend telemetry config (metrics/health endpoint and documentation).");
    }
    if (lower.includes("layered monorepo required") || lower.includes("expected separate backend/ and frontend/")) {
      hints.add("Restructure project into layered monorepo with independent backend/ and frontend/ subprojects.");
    }
    if (lower.includes("layered monorepo backend is incomplete")) {
      hints.add("Add backend runtime manifest (backend/pom.xml, backend/package.json, or backend/requirements.txt) and runnable scripts.");
    }
    if (lower.includes("layered monorepo frontend is incomplete")) {
      hints.add("Add frontend/package.json and runnable frontend scripts for independent execution.");
    }
    if (lower.includes("architecture.md must describe backend/frontend separation")) {
      hints.add("Update architecture.md with backend/frontend boundaries and explicit API contract ownership.");
    }
    if (lower.includes("missing bean validation")) {
      hints.add("Use javax/jakarta validation annotations on DTO/request models.");
    }
    const missingDep = /missing dependency '([^']+)'/i.exec(line);
    if (missingDep && missingDep[1]) {
      hints.add(`Add missing dependency ${missingDep[1]} and align imports.`);
    }
    if (lower.includes("cannot find module")) {
      const single = extractQuotedValue(line, "'");
      const dbl = single ? "" : extractQuotedValue(line, "\"");
      const mod = single || dbl;
      if (mod) {
        hints.add(`Install/configure module ${mod} or remove stale import usage.`);
      }
    }
    if (lower.includes("provider response unusable") || lower.includes("did not return valid files")) {
      hints.add("Provider output contract failed. Return strict JSON files payload only and keep response concise.");
    }
    if (lower.includes("ready for your command") || lower.includes("empty output")) {
      hints.add("Provider non-delivery detected. Retry with compact prompt and strict JSON-only contract.");
    }
  }
  return [...hints].slice(0, 8);
}

function readLatestRequirementJson(projectRoot: string): {
  id: string;
  objective: string;
  actors: string[];
  scopeIn: string[];
  acceptance: string[];
  constraints: string[];
  risks: string[];
} | null {
  try {
    const doneRoot = path.join(projectRoot, "requirements", "done");
    if (!fs.existsSync(doneRoot)) return null;
    const reqDirs = fs
      .readdirSync(doneRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const reqId of reqDirs) {
      const file = path.join(doneRoot, reqId, "requirement.json");
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
        id?: string;
        objective?: string;
        actors?: string[];
        scope?: { in?: string[] };
        acceptanceCriteria?: string[];
        constraints?: string[];
        risks?: string[];
      };
      return {
        id: String(parsed.id || reqId),
        objective: String(parsed.objective || ""),
        actors: Array.isArray(parsed.actors) ? parsed.actors.map((v) => String(v)) : [],
        scopeIn: Array.isArray(parsed.scope?.in) ? parsed.scope.in.map((v) => String(v)) : [],
        acceptance: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria.map((v) => String(v)) : [],
        constraints: Array.isArray(parsed.constraints) ? parsed.constraints.map((v) => String(v)) : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.map((v) => String(v)) : []
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function collectQualityFeedback(projectRoot?: string | null): string[] {
  if (!projectRoot) {
    return [];
  }
  const diagnostics: string[] = [];
  const runStatus = readJsonFile<{
    lifecycle?: { diagnostics?: string[] };
    blockers?: string[];
  }>(path.join(projectRoot, "sdd-run-status.json"));
  diagnostics.push(...(runStatus?.lifecycle?.diagnostics ?? []));
  diagnostics.push(...(runStatus?.blockers ?? []));
  const lifecycleReport = readJsonFile<{
    steps?: Array<{ ok?: boolean; command?: string; output?: string }>;
  }>(path.join(projectRoot, "generated-app", "deploy", "lifecycle-report.json"));
  const failedSteps = (lifecycleReport?.steps ?? [])
    .filter((step) => !step?.ok)
    .slice(-6)
    .map((step) => `${String(step?.command || "step")}: ${String(step?.output || "").slice(0, 240)}`);
  diagnostics.push(...failedSteps);
  const qualityBacklog = readJsonFile<{
    entries?: Array<{ diagnostics?: string[]; hints?: string[] }>;
  }>(path.join(projectRoot, "generated-app", "deploy", "quality-backlog.json"));
  const lastBacklog = qualityBacklog?.entries?.at(-1);
  diagnostics.push(...(lastBacklog?.diagnostics ?? []).slice(0, 8));
  diagnostics.push(...(lastBacklog?.hints ?? []).slice(0, 8));
  return qualityHintsFromDiagnostics(
    diagnostics
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .slice(0, 20)
  );
}

export function requirementQualityFeedback(projectRoot?: string | null): string[] {
  if (!projectRoot) return [];
  const req = readLatestRequirementJson(projectRoot);
  if (!req) return [];
  const measurableAcceptance = req.acceptance.filter((item) =>
    /(\d+%|\d+\s*(ms|s|sec|seconds|min|minutes)|p95|p99|under\s+\d+|>=?\s*\d+|<=?\s*\d+)/i.test(item)
  ).length;
  const iterationScopedScopeIn = req.scopeIn.filter((item) => /\b(iteration|sprint|phase|increment)\b/i.test(item)).length;
  const iterationScopedAcceptance = req.acceptance.filter((item) => /\b(iteration|sprint|phase|increment)\b/i.test(item)).length;
  const technicalScopeSignals = req.scopeIn.filter((item) =>
    /\b(backend|frontend|api|controller|service|repository|dto|validation|schema|database|component|test|smoke|ci|build)\b/i.test(item)
  ).length;
  const backendScopeSignals = req.scopeIn.filter((item) =>
    /\b(backend|api|controller|service|repository|dto|validation|schema|database)\b/i.test(item)
  ).length;
  const frontendScopeSignals = req.scopeIn.filter((item) => /\b(frontend|ui|react|component|hooks?|client)\b/i.test(item)).length;
  const hints: string[] = [];
  if (req.objective.trim().length < 80) {
    hints.push("Expand objective with explicit business value, target users, and measurable success outcomes.");
  }
  if (/\b(create|build|develop|generate)\b.*\b(app|application|platform|system)\b/i.test(req.objective)) {
    hints.push("Replace broad product-mission objective with one iteration-scoped deliverable slice for current round.");
  }
  if (req.actors.length < 4) {
    hints.push("Increase actors to at least 4 concrete roles (user, product, QA, operations/security).");
  }
  if (req.scopeIn.length < 8) {
    hints.push("Expand scope_in to at least 8 concrete capabilities tied to product value.");
  }
  if (technicalScopeSignals < 5) {
    hints.push("Increase technical specificity in scope_in (backend/frontend/api/controller/service/repository/dto/validation/schema/tests).");
  }
  if (backendScopeSignals < 2 || frontendScopeSignals < 2) {
    hints.push("Define layered implementation slices in scope_in with explicit backend and frontend deliverables per iteration.");
  }
  if (iterationScopedScopeIn < 3) {
    hints.push("Ensure scope_in includes at least 3 iteration/sprint-scoped implementation slices.");
  }
  if (req.acceptance.length < 10 || measurableAcceptance < 2) {
    hints.push("Add at least 10 acceptance criteria and include at least 2 measurable thresholds.");
  }
  if (iterationScopedAcceptance < 3) {
    hints.push("Ensure acceptance criteria includes at least 3 iteration/sprint-scoped executable checks.");
  }
  if (backendScopeSignals >= 1 && frontendScopeSignals >= 1) {
    const architectureSignals = req.scopeIn.filter((item) => /\b(contract|boundary|integration|monorepo|backend\/|frontend\/)\b/i.test(item)).length;
    if (architectureSignals < 2) {
      hints.push("Add explicit architecture contract slices (backend/frontend boundaries, API contracts, monorepo folder ownership).");
    }
  }
  if (req.constraints.length < 4) {
    hints.push("Add at least 4 concrete constraints (platform/runtime/process constraints).");
  }
  if (req.risks.length < 4) {
    hints.push("Add at least 4 concrete delivery risks with mitigation intent.");
  }
  return hints.slice(0, 6);
}
