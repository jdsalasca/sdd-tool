import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { ensureConfig } from "../config";

type StepResult = {
  ok: boolean;
  command: string;
  output: string;
};

type RepoMetadata = {
  repoName: string;
  description: string;
  license: string;
};

export type LifecycleContext = {
  goalText?: string;
  intentSignals?: string[];
  intentDomain?: string;
  intentFlow?: string;
  deferPublishUntilReview?: boolean;
};

type GoalProfile = {
  javaReactFullstack: boolean;
  relationalDataApp: boolean;
  apiLikeApp: boolean;
};

type DomainQualityProfile = "software" | "legal" | "business" | "humanities" | "learning" | "design" | "data_science" | "generic";

function collectFilesRecursive(root: string, maxDepth = 8): string[] {
  const results: string[] = [];
  const walk = (current: string, depth: number): void => {
    if (depth > maxDepth) {
      return;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if ([".git", "node_modules", "dist", "build", "target", "__pycache__", ".venv", "venv", "generated-app"].includes(entry.name.toLowerCase())) {
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

function countJsTsTests(root: string, maxDepth = 8): number {
  const files = collectFilesRecursive(root, maxDepth)
    .filter((rel) => /\.(jsx?|tsx?)$/i.test(rel))
    .filter((rel) => /\.test\.|\.spec\.|__tests__\//i.test(rel));
  let count = 0;
  for (const rel of files) {
    const raw = fs.readFileSync(path.join(root, rel), "utf-8");
    count += (raw.match(/\b(test|it)\s*\(/g) || []).length;
  }
  return count;
}

function fileExistsAny(root: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return null;
}

function findFileRecursive(root: string, predicate: (relative: string) => boolean, maxDepth = 4): string | null {
  const walk = (current: string, depth: number): string | null => {
    if (depth > maxDepth) {
      return null;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if ([".git", "node_modules", "dist", "build", "target", "__pycache__", "generated-app"].includes(entry.name)) {
          continue;
        }
        const nested = walk(full, depth + 1);
        if (nested) {
          return nested;
        }
      } else if (predicate(rel.toLowerCase())) {
        return rel;
      }
    }
    return null;
  };
  return walk(root, 0);
}

function countTestsRecursive(root: string, maxDepth = 8): number {
  const walk = (current: string, depth: number): number => {
    if (depth > maxDepth) {
      return 0;
    }
    let count = 0;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, "/").toLowerCase();
      if (entry.isDirectory()) {
        if ([".git", "node_modules", "dist", "build", "target", "__pycache__", ".venv", "venv", "generated-app"].includes(entry.name.toLowerCase())) {
          continue;
        }
        count += walk(full, depth + 1);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (![".js", ".jsx", ".ts", ".tsx", ".py", ".java"].includes(ext)) {
        continue;
      }
      const raw = fs.readFileSync(full, "utf-8");
      if (ext === ".py") {
        count += (raw.match(/\bdef\s+test_/g) || []).length;
      } else if (ext === ".java") {
        count += (raw.match(/@Test\b/g) || []).length;
      } else if (rel.includes(".test.") || rel.includes(".spec.") || rel.includes("__tests__/")) {
        count += (raw.match(/\b(test|it)\s*\(/g) || []).length;
      }
    }
    return count;
  };
  return walk(root, 0);
}

function run(command: string, args: string[], cwd: string): StepResult {
  let resolved = command;
  if (process.platform === "win32") {
    if (command === "npm") {
      resolved = "npm.cmd";
    } else if (command === "mvn") {
      resolved = "mvn.cmd";
    }
  }
  const useShell = process.platform === "win32" && resolved.toLowerCase().endsWith(".cmd");
  const result = useShell
    ? spawnSync([resolved, ...args].join(" "), { cwd, encoding: "utf-8", shell: true })
    : spawnSync(resolved, args, { cwd, encoding: "utf-8", shell: false });
  const rawOutput = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const merged = rawOutput || (result.error ? String(result.error.message || result.error) : "");
  const output = merged.length > 3500 ? `${merged.slice(0, 3500)}\n...[truncated]` : merged;
  return {
    ok: result.status === 0,
    command: [resolved, ...args].join(" "),
    output
  };
}

function hasCommand(command: string): boolean {
  const check = process.platform === "win32" ? run("where", [command], process.cwd()) : run("which", [command], process.cwd());
  return check.ok;
}

function runIfScript(cwd: string, script: string): StepResult | null {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
    if (!pkg.scripts || !pkg.scripts[script]) {
      return null;
    }
    return run("npm", ["run", script], cwd);
  } catch {
    return null;
  }
}

function readPackageJson(
  cwd: string
): { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

function packageNeedsInstall(cwd: string): boolean {
  const pkg = readPackageJson(cwd);
  if (!pkg) {
    return false;
  }
  const depCount = Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length;
  return depCount > 0;
}

function parseGoalProfile(context?: LifecycleContext): GoalProfile {
  const goal = normalizeText(context?.goalText ?? "");
  const hasJava = /\bjava\b/.test(goal);
  const hasReact = /\breact\b/.test(goal);
  const apiLikeApp = /\bapi\b|\bbackend\b|\brest\b|\bserver\b|\bmicroservice\b|\bfastapi\b|\bexpress\b|\bspring\b/.test(goal);
  const relationalHints = [
    "library",
    "biblioteca",
    "inventario",
    "inventory",
    "prestamo",
    "prestamos",
    "loan",
    "loans",
    "usuario",
    "usuarios",
    "user",
    "users",
    "book",
    "books",
    "cita",
    "citas",
    "appointment",
    "appointments",
    "hospital",
    "gestion",
    "management"
  ];
  const relationalDataApp = relationalHints.some((hint) => goal.includes(hint));
  return {
    javaReactFullstack: hasJava && hasReact,
    relationalDataApp,
    apiLikeApp
  };
}

function hasSmokeScript(cwd: string): string | null {
  const pkg = readPackageJson(cwd);
  if (!pkg?.scripts) {
    return null;
  }
  if (pkg.scripts["smoke"]) return "smoke";
  if (pkg.scripts["test:smoke"]) return "test:smoke";
  if (pkg.scripts["e2e"]) return "e2e";
  return null;
}

function scanSourceFiles(root: string): Array<{ rel: string; raw: string }> {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files = collectFilesRecursive(root, 10).filter((rel) => /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(rel));
  return files.map((rel) => ({ rel, raw: fs.readFileSync(path.join(root, rel), "utf-8") }));
}

function preflightQualityCheck(appDir: string): StepResult {
  const issues: string[] = [];
  const nestedGenerated = path.join(appDir, "generated-app", "package.json");
  if (fs.existsSync(nestedGenerated)) {
    issues.push("Nested generated-app/package.json detected; project structure is recursively duplicated.");
  }

  const pkg = readPackageJson(appDir);
  if (typeof pkg?.name === "string" && pkg.name.trim().toLowerCase() === "sdd-cli") {
    issues.push("Generated app package name must not be 'sdd-cli' (template leakage from orchestrator package).");
  }
  if (pkg?.scripts) {
    const scriptReferencesFile = (script: string): string | null => {
      const normalized = script.replace(/\\/g, "/");
      const nodeMatch = /\bnode\s+((?:\.\/)?[A-Za-z0-9._/-]+\.js)\b/.exec(normalized);
      if (nodeMatch) {
        return nodeMatch[1].replace(/^\.\//, "");
      }
      if (/\btsc\b/.test(normalized) && /\b-p\s+tsconfig\.json\b/.test(normalized)) {
        return "tsconfig.json";
      }
      return null;
    };
    for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
      if (typeof scriptValue !== "string") {
        continue;
      }
      const fileRef = scriptReferencesFile(scriptValue);
      if (!fileRef) {
        continue;
      }
      const abs = path.join(appDir, fileRef);
      if (!fs.existsSync(abs)) {
        issues.push(`Script '${scriptName}' references missing file '${fileRef}'.`);
      }
    }
    for (const scriptName of ["smoke", "test:smoke", "e2e"]) {
      const script = pkg.scripts[scriptName];
      if (typeof script === "string" && /\.\//.test(script)) {
        issues.push(`Script ${scriptName} uses shell-only path (${script}). Use cross-platform node/npm command.`);
      }
    }
  }

  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const sourceFiles = scanSourceFiles(appDir);
  const importedTokens = [
    { token: "supertest", expected: "supertest" },
    { token: "axios", expected: "axios" },
    { token: "knex", expected: "knex" },
    { token: "ts-jest", expected: "ts-jest" }
  ];
  for (const item of importedTokens) {
    const used = sourceFiles.some(({ raw }) => new RegExp(`['"]${item.token}['"]`).test(raw));
    if (used && typeof deps[item.expected] !== "string") {
      issues.push(`Missing dependency '${item.expected}' while source imports/requires '${item.token}'.`);
    }
  }

  const hasTsTests = sourceFiles.some(({ rel }) => /\.test\.ts$|\.spec\.ts$/.test(rel));
  const jestConfigPath =
    fileExistsAny(appDir, ["jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.ts"]) ??
    fileExistsAny(path.join(appDir, "config"), ["jest.config.js", "jest.config.cjs"]);
  if (hasTsTests && typeof deps["ts-jest"] !== "string") {
    issues.push("TypeScript tests detected but ts-jest is not declared.");
  }
  if (hasTsTests && jestConfigPath) {
    const cfg = normalizeText(fs.readFileSync(jestConfigPath, "utf-8"));
    if (/preset\s*:\s*['"]ts-jest['"]/.test(cfg) && typeof deps["ts-jest"] !== "string") {
      issues.push("Jest config uses ts-jest preset but ts-jest dependency is missing.");
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      command: "preflight-quality-check",
      output: issues.join(" | ")
    };
  }
  return {
    ok: true,
    command: "preflight-quality-check",
    output: "Preflight checks passed"
  };
}

function hasCurlEvidence(root: string): boolean {
  const files = collectFilesRecursive(root, 8).filter((rel) => /\.(md|sh|ps1|txt|http|yml|yaml|json)$/i.test(rel));
  for (const rel of files) {
    const raw = normalizeText(fs.readFileSync(path.join(root, rel), "utf-8"));
    if (/\bcurl\b/.test(raw) || /http:\/\/localhost|https:\/\/localhost/.test(raw)) {
      return true;
    }
  }
  return false;
}

function parseDomainProfile(context?: LifecycleContext): DomainQualityProfile {
  const hinted = normalizeText(context?.intentDomain ?? "");
  if (
    hinted === "software" ||
    hinted === "legal" ||
    hinted === "business" ||
    hinted === "humanities" ||
    hinted === "learning" ||
    hinted === "design" ||
    hinted === "data_science" ||
    hinted === "generic"
  ) {
    return hinted as DomainQualityProfile;
  }

  const goal = normalizeText(context?.goalText ?? "");
  if (!goal) {
    return "generic";
  }
  if (/\bcourt\b|\blaw\b|\bpolicy\b|\bcompliance\b|\blawyer\b|\bregulation\b|\bcontract\b|\bjuridic/.test(goal)) {
    return "legal";
  }
  if (/\bpricing\b|\bmarket\b|\bforecast\b|\beconomics\b|\baccounting\b|\bfinanzas\b|\bcontador\b/.test(goal)) {
    return "business";
  }
  if (/\bhistory\b|\bsociology\b|\banthropology\b|\bphilosophy\b|\bliterature\b|\bhumanities\b/.test(goal)) {
    return "humanities";
  }
  if (/\blearn\b|\bteach\b|\blesson\b|\bcourse\b|\bstudent\b|\bmentor\b|\bwriter\b|\bescritor\b/.test(goal)) {
    return "learning";
  }
  if (/\blogo\b|\bbrand\b|\blayout\b|\bvisual\b|\bdesign\b/.test(goal)) {
    return "design";
  }
  if (/\bmodel\b|\bdataset\b|\bprediction\b|\bmachine learning\b|\bml\b|\bai\b/.test(goal)) {
    return "data_science";
  }
  if (/\bapi\b|\bbackend\b|\bfrontend\b|\bapp\b|\bweb\b|\bdesktop\b|\bmobile\b|\breact\b|\bjava\b/.test(goal)) {
    return "software";
  }
  return "generic";
}

function countListLikeItems(raw: string): number {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)).length;
}

function checkDomainArtifacts(appDir: string, context?: LifecycleContext): { ok: boolean; reason?: string } {
  const profile = parseDomainProfile(context);
  if (profile === "software" || profile === "generic") {
    return { ok: true };
  }

  const findDoc = (patterns: RegExp[]): string | null =>
    findFileRecursive(
      appDir,
      (rel) => rel.endsWith(".md") && patterns.some((pattern) => pattern.test(rel)),
      10
    );
  const readDoc = (rel: string | null): string => {
    if (!rel) return "";
    try {
      return normalizeText(fs.readFileSync(path.join(appDir, rel), "utf-8"));
    } catch {
      return "";
    }
  };

  if (profile === "legal") {
    const compliance = findDoc([/compliance/, /regulation/, /policy/]);
    const risk = findDoc([/risk/, /risk-register/]);
    const evidence = findDoc([/citation/, /reference/, /sources/, /precedent/]);
    if (!compliance || !risk || !evidence) {
      return { ok: false, reason: "Missing legal artifacts (need compliance, risk-register, and references/citations docs)." };
    }
    const complianceText = readDoc(compliance);
    if (!/\bjurisdiction\b|\bregion\b|\bcountry\b|\blaw\b|\bregulation\b/.test(complianceText)) {
      return { ok: false, reason: "Legal compliance doc must define jurisdiction and applicable law/regulation scope." };
    }
    return { ok: true };
  }

  if (profile === "business") {
    const assumptions = findDoc([/assumption/, /supuesto/]);
    const sensitivity = findDoc([/sensitivity/, /scenario/, /escenario/]);
    const economics = findDoc([/unit-economics/, /economics/, /forecast/, /financial/, /cashflow/, /p&l/]);
    if (!assumptions || !sensitivity || !economics) {
      return { ok: false, reason: "Missing business artifacts (need assumptions, sensitivity/scenarios, and economics/forecast docs)." };
    }
    const economicsText = readDoc(economics);
    if (!/\b\d/.test(economicsText)) {
      return { ok: false, reason: "Business economics/forecast doc should include at least one numeric metric or target." };
    }
    return { ok: true };
  }

  if (profile === "humanities") {
    const methodology = findDoc([/methodology/, /approach/, /metodologia/]);
    const sources = findDoc([/sources/, /reference/, /bibliography/, /citations/]);
    if (!methodology || !sources) {
      return { ok: false, reason: "Missing humanities artifacts (need methodology and sources/bibliography docs)." };
    }
    const sourcesText = readDoc(sources);
    if (countListLikeItems(sourcesText) < 3) {
      return { ok: false, reason: "Humanities source quality too low (expected at least 3 listed sources)." };
    }
    return { ok: true };
  }

  if (profile === "learning") {
    const curriculum = findDoc([/curriculum/, /outline/, /syllabus/, /plan/]);
    const exercises = findDoc([/exercise/, /assessment/, /practice/, /rubric/]);
    const references = findDoc([/sources/, /references/, /reading/, /bibliography/]);
    if (!curriculum || !exercises || !references) {
      return { ok: false, reason: "Missing learning artifacts (need curriculum/outline, exercises/assessment, and references)." };
    }
    return { ok: true };
  }

  if (profile === "design") {
    const designSystem = findDoc([/design-system/, /style-guide/, /brand/, /ui-kit/]);
    const accessibility = findDoc([/accessibility/, /a11y/, /wcag/]);
    const rationale = findDoc([/rationale/, /decision/, /tradeoff/]);
    if (!designSystem || !accessibility || !rationale) {
      return { ok: false, reason: "Missing design artifacts (need design-system/style-guide, accessibility, and rationale docs)." };
    }
    return { ok: true };
  }

  if (profile === "data_science") {
    const dataDict = findDoc([/dataset/, /schema/, /data-dictionary/]);
    const evaluation = findDoc([/evaluation/, /metrics/, /benchmark/]);
    const monitoring = findDoc([/monitoring/, /drift/, /alert/]);
    const reproducibility = findDoc([/reproducibility/, /experiment/, /runbook/]);
    if (!dataDict || !evaluation || !monitoring || !reproducibility) {
      return {
        ok: false,
        reason: "Missing data science artifacts (need dataset schema, evaluation metrics, monitoring/drift plan, and reproducibility docs)."
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

function basicQualityCheck(appDir: string): StepResult {
  const required = ["README.md"];
  const missing = required.filter((name) => !fs.existsSync(path.join(appDir, name)));
  if (missing.length > 0) {
    return {
      ok: false,
      command: "basic-quality-check",
      output: `Missing files: ${missing.join(", ")}`
    };
  }
  return {
    ok: true,
    command: "basic-quality-check",
    output: "Basic checks passed"
  };
}

function advancedQualityCheck(appDir: string, context?: LifecycleContext): StepResult {
  const readmePath = path.join(appDir, "README.md");
  const hasReadme = fs.existsSync(readmePath);
  const hasLicense = fs.existsSync(path.join(appDir, "LICENSE"));
  if (!hasReadme) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "Missing README.md"
    };
  }

  const files = fs.readdirSync(appDir);
  const hasPackage = files.includes("package.json");
  const hasRequirements = files.includes("requirements.txt");
  if (hasPackage && hasRequirements) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "Mixed runtime manifests detected (package.json + requirements.txt). Pick one runtime stack."
    };
  }
  const testCount = countTestsRecursive(appDir);

  if (testCount < 8) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: `Expected at least 8 tests, found ${testCount}`
    };
  }
  const readme = fs.readFileSync(readmePath, "utf-8").toLowerCase();
  const nonProductionPatterns = [
    /\bproof[-\s]?of[-\s]?concept\b/,
    /\bpoc\b/,
    /\bfirst[-\s]?draft\b/,
    /\bprototype\b/,
    /\bdemo[-\s]?only\b/,
    /\bplaceholder\b/
  ];
  if (nonProductionPatterns.some((pattern) => pattern.test(readme))) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "README declares non-production intent (POC/prototype/placeholder). Delivery must be production-ready."
    };
  }
  const requiredSections = ["features", "test"];
  const missingSections = requiredSections.filter((section) => !readme.includes(section));
  if (missingSections.length > 0) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: `README missing sections: ${missingSections.join(", ")}`
    };
  }
  if (!/\brun\b|\bstart\b|\bsetup\b/.test(readme)) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "README missing execution/start instructions"
    };
  }

  const schemaDoc =
    findFileRecursive(appDir, (rel) => rel === "schemas.md" || rel.endsWith("/schemas.md")) ??
    findFileRecursive(appDir, (rel) => rel.includes("schema") && rel.endsWith(".md"));
  if (!schemaDoc) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "Missing schemas.md (or equivalent schema markdown document)"
    };
  }
  const profile = parseGoalProfile(context);
  const domainProfile = parseDomainProfile(context);
  if ((domainProfile === "software" || domainProfile === "generic") && hasPackage) {
    const rootSmoke = hasSmokeScript(appDir);
    const frontendSmoke = hasSmokeScript(path.join(appDir, "frontend"));
    if (!rootSmoke && !frontendSmoke) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing smoke/e2e npm script for software delivery (expected smoke, test:smoke, or e2e)."
      };
    }
  }
  if (profile.relationalDataApp) {
    const sqlSchema =
    findFileRecursive(appDir, (rel) => rel === "schema.sql" || rel.endsWith("/schema.sql")) ??
      findFileRecursive(
        appDir,
        (rel) => rel.endsWith(".sql") && (rel.includes("schema") || rel.includes("init") || rel.includes("migration")),
        10
      );
    if (!sqlSchema) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing SQL schema file (expected schema.sql or migration .sql) for relational data app"
      };
    }
    const schemaText = normalizeText(fs.readFileSync(path.join(appDir, schemaDoc), "utf-8"));
    const readmeText = readme;
    if (!/(postgres|postgresql|mysql|mariadb|sqlite)/.test(`${schemaText}\n${readmeText}`)) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Database technology not explicit in README/schemas (expected PostgreSQL/MySQL/MariaDB/SQLite)"
      };
    }
  }
  if (profile.apiLikeApp && !hasCurlEvidence(appDir)) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "API-like app requires curl/local endpoint verification evidence in docs/scripts."
    };
  }

  if (profile.javaReactFullstack) {
    const hasBackendPom = fs.existsSync(path.join(appDir, "backend", "pom.xml"));
    const hasFrontendPkg = fs.existsSync(path.join(appDir, "frontend", "package.json"));
    if (!hasBackendPom || !hasFrontendPkg) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Expected Java+React fullstack structure: backend/pom.xml and frontend/package.json"
      };
    }
    const frontendPkg = readPackageJson(path.join(appDir, "frontend"));
    if (frontendPkg) {
      const deps = { ...(frontendPkg.dependencies ?? {}), ...(frontendPkg.devDependencies ?? {}) };
      if (typeof deps["react-query"] === "string") {
        return {
          ok: false,
          command: "advanced-quality-check",
          output: "Outdated frontend dependency detected: react-query. Use @tanstack/react-query."
        };
      }
      const requiredFrontendDeps = ["react-router-dom", "@tanstack/react-query"];
      const missingFrontendDeps = requiredFrontendDeps.filter((dep) => typeof deps[dep] !== "string");
      if (missingFrontendDeps.length > 0) {
        return {
          ok: false,
          command: "advanced-quality-check",
          output: `Missing modern frontend dependencies: ${missingFrontendDeps.join(", ")}`
        };
      }
    }

    const backendRoot = path.join(appDir, "backend", "src", "main", "java");
    if (!fs.existsSync(backendRoot)) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing backend/src/main/java for Java backend implementation"
      };
    }
    const backendFiles = collectFilesRecursive(backendRoot, 12).filter((rel) => rel.toLowerCase().endsWith(".java"));
    const hasDto = backendFiles.some((rel) => /\/dto\//i.test(`/${rel}`) || /dto\.java$/i.test(rel));
    if (!hasDto) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing Java DTO layer (expected dto package and *Dto.java files)"
      };
    }
    const hasRecord = backendFiles.some((rel) => /\brecord\b/.test(fs.readFileSync(path.join(backendRoot, rel), "utf-8")));
    if (!hasRecord) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing Java record usage (expected at least one record for immutable transport/domain models)"
      };
    }
    const serviceFiles = backendFiles.filter((rel) => /\/service\//i.test(`/${rel}`));
    const repositoryFiles = backendFiles.filter((rel) => /\/repository\//i.test(`/${rel}`));
    const hasServiceInterface = serviceFiles.some((rel) =>
      /\binterface\b/.test(fs.readFileSync(path.join(backendRoot, rel), "utf-8"))
    );
    const hasRepositoryInterface = repositoryFiles.some((rel) =>
      /\binterface\b/.test(fs.readFileSync(path.join(backendRoot, rel), "utf-8"))
    );
    if (!hasServiceInterface || !hasRepositoryInterface) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing service/repository interfaces in Java backend architecture"
      };
    }
    const hasControllerAdvice = backendFiles.some((rel) =>
      /@RestControllerAdvice\b/.test(fs.readFileSync(path.join(backendRoot, rel), "utf-8"))
    );
    if (!hasControllerAdvice) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing global exception handling (expected @RestControllerAdvice)"
      };
    }
    const hasValidationUsage = backendFiles.some((rel) => {
      const raw = fs.readFileSync(path.join(backendRoot, rel), "utf-8");
      return /\b@(Valid|NotNull|NotBlank|Size|Email)\b/.test(raw) && /(jakarta|javax)\.validation/.test(raw);
    });
    if (!hasValidationUsage) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing bean validation usage (expected @Valid/@NotBlank with jakarta/javax.validation imports)"
      };
    }
    const pomPath = path.join(appDir, "backend", "pom.xml");
    const pomRaw = fs.existsSync(pomPath) ? fs.readFileSync(pomPath, "utf-8").toLowerCase() : "";
    const requiredBackendDeps = [
      "lombok",
      "spring-boot-starter-validation",
      "spring-boot-starter-actuator"
    ];
    const missingBackendDeps = requiredBackendDeps.filter((dep) => !pomRaw.includes(dep));
    if (missingBackendDeps.length > 0) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: `Missing backend dependencies for production quality: ${missingBackendDeps.join(", ")}`
      };
    }
    const hasMetricsConfig = (() => {
      const metricsFile = fileExistsAny(path.join(appDir, "backend"), [
        "src/main/resources/application.yml",
        "src/main/resources/application.yaml",
        "src/main/resources/application.properties"
      ]);
      if (!metricsFile) {
        return false;
      }
      const text = normalizeText(fs.readFileSync(metricsFile, "utf-8"));
      return /management\.endpoints|prometheus|actuator/.test(text);
    })();
    if (!hasMetricsConfig) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing backend telemetry config (expected actuator/prometheus management settings)"
      };
    }

    const frontendRoot = path.join(appDir, "frontend", "src");
    if (!fs.existsSync(frontendRoot)) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing frontend/src for React frontend implementation"
      };
    }
    const frontendFiles = collectFilesRecursive(frontendRoot, 10);
    const hasApiLayer = frontendFiles.some((rel) => /^api\//i.test(rel) || /\/api\//i.test(`/${rel}`));
    const hasHooksLayer = frontendFiles.some((rel) => /^hooks\/use[A-Z].*\.(t|j)sx?$/i.test(rel) || /\/hooks\/use[A-Z]/.test(rel));
    const hasComponentsLayer = frontendFiles.some((rel) => /^components\//i.test(rel) || /\/components\//i.test(`/${rel}`));
    if (!hasApiLayer || !hasHooksLayer || !hasComponentsLayer) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing frontend layers (expected src/api, src/hooks/use*.ts(x), and src/components)"
      };
    }
    const frontendTestCount = countJsTsTests(path.join(appDir, "frontend"), 10);
    if (frontendTestCount < 3) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: `Expected at least 3 frontend tests for Java+React profile, found ${frontendTestCount}`
      };
    }
    const frontendUsesStrictMode = (() => {
      const mainCandidate = fileExistsAny(path.join(appDir, "frontend"), ["src/main.tsx", "src/main.jsx", "src/index.tsx", "src/index.jsx"]);
      if (!mainCandidate) {
        return false;
      }
      const raw = fs.readFileSync(mainCandidate, "utf-8");
      return /StrictMode/.test(raw);
    })();
    if (!frontendUsesStrictMode) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing React StrictMode in frontend bootstrap"
      };
    }
    const executionGuideExists =
      findFileRecursive(appDir, (rel) => rel === "execution-guide.md" || rel.endsWith("/execution-guide.md"), 8) ??
      findFileRecursive(appDir, (rel) => rel.includes("runbook") && rel.endsWith(".md"), 8);
    if (!executionGuideExists) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing execution guide/runbook markdown (expected execution-guide.md or runbook*.md)"
      };
    }
    const architectureDocExists =
      findFileRecursive(appDir, (rel) => rel === "architecture.md" || rel.endsWith("/architecture.md"), 8) ??
      findFileRecursive(appDir, (rel) => rel.includes("architecture") && rel.endsWith(".md"), 8);
    if (!architectureDocExists) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing architecture documentation markdown (expected architecture.md)"
      };
    }
  }

  const dummyLocalDoc =
    findFileRecursive(appDir, (rel) => rel.includes("dummylocal") && rel.endsWith(".md")) ??
    findFileRecursive(appDir, (rel) => rel.includes("dummy-local") && rel.endsWith(".md")) ??
    findFileRecursive(appDir, (rel) => rel.includes("dummy_local") && rel.endsWith(".md"));
  if (!dummyLocalDoc) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "Missing DummyLocal integration doc (expected markdown file with dummylocal/dummy-local in name)"
    };
  }
  const componentsDoc =
    findFileRecursive(appDir, (rel) => rel === "components.md" || rel.endsWith("/components.md"), 8) ??
    findFileRecursive(appDir, (rel) => rel.includes("component") && rel.endsWith(".md"), 8);
  if (!componentsDoc) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "Missing components.md (required for extensible component-oriented delivery)"
    };
  }
  if (domainProfile === "software" || domainProfile === "generic") {
    const architectureDoc =
      findFileRecursive(appDir, (rel) => rel === "architecture.md" || rel.endsWith("/architecture.md"), 8) ??
      findFileRecursive(appDir, (rel) => rel.includes("architecture") && rel.endsWith(".md"), 8);
    if (!architectureDoc) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Missing architecture.md (required for software production readiness)"
      };
    }
    const architectureText = normalizeText(fs.readFileSync(path.join(appDir, architectureDoc), "utf-8"));
    if (!/\bmvc\b|model|controller|view/.test(architectureText)) {
      return {
        ok: false,
        command: "advanced-quality-check",
        output: "Architecture docs must describe MVC layering (model/controller/view or equivalent)."
      };
    }
  }

  const regressionEvidence =
    findFileRecursive(appDir, (rel) => rel.includes("regression") && (rel.endsWith(".md") || rel.endsWith(".js") || rel.endsWith(".py") || rel.endsWith(".java"))) ??
    (readme.includes("regression") ? "README.md" : null);
  if (!regressionEvidence) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: "Missing regression testing evidence (regression doc or tests)"
    };
  }

  const domainArtifacts = checkDomainArtifacts(appDir, context);
  if (!domainArtifacts.ok) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: domainArtifacts.reason || "Domain artifact quality check failed"
    };
  }

  const goalText = context?.goalText?.trim();
  if (goalText) {
    const readmeRaw = fs.readFileSync(readmePath, "utf-8");
    const projectCorpus = normalizeText(
      [
        readmeRaw,
        ...fs
          .readdirSync(appDir)
          .filter((name) => !name.startsWith("."))
          .slice(0, 50)
      ].join("\n")
    );
    const intentKeywords = [
      ...tokenizeIntent(goalText),
      ...(context?.intentSignals ?? []).flatMap((signal) => tokenizeIntent(signal))
    ];
    const uniqueKeywords = [...new Set(intentKeywords)].filter((keyword) => keyword.length >= 3);
    if (uniqueKeywords.length > 0) {
      const matched = uniqueKeywords.filter((keyword) => {
        const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        return pattern.test(projectCorpus);
      });
      const minimumMatches = uniqueKeywords.length >= 5 ? 3 : uniqueKeywords.length >= 3 ? 2 : 1;
      if (matched.length < minimumMatches) {
        const missing = uniqueKeywords.filter((keyword) => !matched.includes(keyword)).slice(0, 6);
        return {
          ok: false,
          command: "advanced-quality-check",
          output: `Intent alignment failed. Matched ${matched.length}/${uniqueKeywords.length} keywords. Missing examples: ${missing.join(", ")}`
        };
      }
    }
  }

  return {
    ok: true,
    command: "advanced-quality-check",
    output: `Advanced checks passed (${testCount} tests, license: ${hasLicense ? "yes" : "no"}, schema: ${schemaDoc}, dummy: ${dummyLocalDoc}, regression: ${regressionEvidence})`
  };
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenizeIntent(input: string): string[] {
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
  const stopwords = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "for",
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "y",
    "o",
    "con",
    "para",
    "using",
    "use",
    "app",
    "aplicacion",
    "aplicaciones",
    "create",
    "crear",
    "crea",
    "build",
    "hacer",
    "haz",
    "genera",
    "generar",
    "sistema",
    "gestion",
    "management"
  ]);
  const normalized = normalizeText(input);
  const tokens = normalized
    .split(/[^a-z0-9]+/g)
    .map((token) => translate[token] ?? token)
    .filter((token) => token.length >= 3 && !stopwords.has(token));
  return [...new Set(tokens)].slice(0, 14);
}

function detectLicense(appDir: string): string {
  const licensePath = path.join(appDir, "LICENSE");
  if (!fs.existsSync(licensePath)) {
    return "MIT";
  }
  const raw = fs.readFileSync(licensePath, "utf-8").toUpperCase();
  if (raw.includes("MIT LICENSE")) {
    return "MIT";
  }
  if (raw.includes("APACHE LICENSE")) {
    return "Apache-2.0";
  }
  if (raw.includes("GNU GENERAL PUBLIC LICENSE")) {
    return "GPL-3.0";
  }
  return "MIT";
}

function deriveRepoMetadata(projectName: string, appDir: string, context?: LifecycleContext): RepoMetadata {
  const readmePath = path.join(appDir, "README.md");
  const rawBase = projectName
    .replace(/^autopilot-/i, "")
    .replace(/-\d{8}(-\d{6})?$/g, "")
    .replace(/-generated-app$/g, "")
    .trim();
  const goalTokens = context?.goalText ? tokenizeIntent(context.goalText).slice(0, 6) : [];
  const goalSeed = goalTokens.join("-");
  const projectSeed = slugify(rawBase);
  const intentSeed = slugify(goalSeed);
  const base = intentSeed || projectSeed || "sdd-project";
  const cleaned = base.replace(/-app$/g, "").replace(/-project$/g, "");
  const suffix = /platform|suite|hub/.test(cleaned) ? "" : "-platform";
  const repoName = `${cleaned}${suffix}`.slice(0, 63).replace(/-+$/g, "");

  const tagline = goalTokens.length > 0 ? goalTokens.join(" ") : "production operations";
  let description = context?.goalText?.trim()
    ? `Production-ready ${tagline} solution generated with sdd-tool.`
    : `Production-ready software platform generated by sdd-tool for ${projectName}.`;
  if ((!context?.goalText || description.length < 30) && fs.existsSync(readmePath)) {
    const lines = fs
      .readFileSync(readmePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim());
    const descLine = lines.find((line) => line.length > 0 && !line.startsWith("#"));
    if (descLine) {
      description = descLine.slice(0, 200);
    }
  }
  return {
    repoName,
    description,
    license: detectLicense(appDir)
  };
}

export const __internal = {
  tokenizeIntent,
  deriveRepoMetadata
};

function createDeployBundle(appDir: string): StepResult {
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const reportPath = path.join(deployDir, "deployment.md");
  const lines = [
    "# Deployment Report",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Local Deployment",
    "- App files are available under this directory.",
    "- For static web apps, open `index.html` or serve folder via any static host.",
    "",
    "## Publish",
    "- GitHub publish is attempted automatically when `gh` is authenticated."
  ];
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf-8");
  return { ok: true, command: "write deploy/deployment.md", output: reportPath };
}

function ensureGitIgnore(appDir: string): void {
  const file = path.join(appDir, ".gitignore");
  if (fs.existsSync(file)) {
    return;
  }
  fs.writeFileSync(file, "node_modules/\ndist/\ncoverage/\n.env\n", "utf-8");
}

function ensureGitRepo(appDir: string): StepResult {
  if (!hasCommand("git")) {
    return { ok: false, command: "git", output: "git not available" };
  }
  ensureGitIgnore(appDir);
  const init = fs.existsSync(path.join(appDir, ".git")) ? { ok: true, command: "git init", output: "existing repository" } : run("git", ["init"], appDir);
  if (!init.ok) {
    return init;
  }
  run("git", ["branch", "-M", "main"], appDir);
  const nameCheck = run("git", ["config", "--get", "user.name"], appDir);
  if (!nameCheck.ok || !nameCheck.output.trim()) {
    run("git", ["config", "user.name", "sdd-cli-bot"], appDir);
  }
  const emailCheck = run("git", ["config", "--get", "user.email"], appDir);
  if (!emailCheck.ok || !emailCheck.output.trim()) {
    run("git", ["config", "user.email", "sdd-cli-bot@local"], appDir);
  }
  run("git", ["add", "."], appDir);
  const commit = run("git", ["commit", "-m", "feat: generated app lifecycle output"], appDir);
  if (!commit.ok && !/nothing to commit/i.test(commit.output)) {
    return commit;
  }
  return { ok: true, command: "git init/add/commit", output: commit.output || "committed" };
}

function tryPublishGitHub(appDir: string, metadata: RepoMetadata): StepResult {
  if (!hasCommand("gh")) {
    return { ok: false, command: "gh", output: "gh CLI not available" };
  }
  const auth = run("gh", ["auth", "status"], appDir);
  if (!auth.ok) {
    return { ok: false, command: "gh auth status", output: "gh not authenticated" };
  }

  const remote = run("git", ["remote", "get-url", "origin"], appDir);
  if (remote.ok) {
    const push = run("git", ["push", "-u", "origin", "main"], appDir);
    if (!push.ok) {
      return { ok: false, command: push.command, output: push.output };
    }
    const edit = run(
      "gh",
      ["repo", "edit", "--description", metadata.description, "--enable-issues=true", "--enable-wiki=false"],
      appDir
    );
    return edit.ok ? push : { ok: false, command: edit.command, output: edit.output };
  }

  const create = run(
    "gh",
    ["repo", "create", metadata.repoName, "--public", "--description", metadata.description, "--source", ".", "--remote", "origin", "--push"],
    appDir
  );
  return create.ok ? create : { ok: false, command: create.command, output: create.output };
}

function ensureRepoRemote(appDir: string, metadata: RepoMetadata): StepResult {
  const remote = run("git", ["remote", "get-url", "origin"], appDir);
  if (remote.ok) {
    return { ok: true, command: "git remote get-url origin", output: remote.output };
  }
  return tryPublishGitHub(appDir, metadata);
}

function nextManagedVersion(appDir: string, finalRelease: boolean, round: number): string {
  const historyPath = path.join(appDir, "deploy", "release-history.json");
  if (!fs.existsSync(historyPath)) {
    return finalRelease ? "v1.0.0" : `v0.9.0-rc.${round}`;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(historyPath, "utf-8")) as {
      releases?: Array<{ version?: string; stage?: string }>;
    };
    const releases = Array.isArray(raw.releases) ? raw.releases : [];
    const stage = finalRelease ? "final" : "candidate";
    const stageCount = releases.filter((entry) => entry.stage === stage).length;
    if (finalRelease) {
      return `v1.0.${stageCount}`;
    }
    return `v0.9.${stageCount}-rc.${round}`;
  } catch {
    return finalRelease ? "v1.0.0" : `v0.9.0-rc.${round}`;
  }
}

function writeReleaseNote(appDir: string, version: string, stage: "candidate" | "final", note: string): string {
  const releasesDir = path.join(appDir, "deploy", "releases");
  fs.mkdirSync(releasesDir, { recursive: true });
  const file = path.join(releasesDir, `${version}.md`);
  const lines = [
    `# ${version}`,
    "",
    `Stage: ${stage}`,
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Summary",
    note
  ];
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf-8");
  return file;
}

function appendReleaseHistory(
  appDir: string,
  entry: { version: string; stage: "candidate" | "final"; note: string; pushed: boolean; published: boolean }
): void {
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const file = path.join(deployDir, "release-history.json");
  const current = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf-8")) as { releases?: unknown[] })
    : { releases: [] };
  const releases = Array.isArray(current.releases) ? current.releases : [];
  releases.push({
    ...entry,
    at: new Date().toISOString()
  });
  fs.writeFileSync(file, JSON.stringify({ releases }, null, 2), "utf-8");
}

function createGitTag(appDir: string, version: string, note: string): StepResult {
  const existing = run("git", ["tag", "--list", version], appDir);
  if (existing.ok && existing.output.trim() === version) {
    return { ok: true, command: `git tag ${version}`, output: "already exists" };
  }
  return run("git", ["tag", "-a", version, "-m", note], appDir);
}

function pushGitWithTags(appDir: string): StepResult {
  const pushMain = run("git", ["push", "-u", "origin", "main"], appDir);
  if (!pushMain.ok) {
    return pushMain;
  }
  const pushTags = run("git", ["push", "--tags"], appDir);
  return pushTags.ok ? pushTags : pushMain;
}

function publishGitHubRelease(appDir: string, version: string, notesFile: string, finalRelease: boolean): StepResult {
  if (!hasCommand("gh")) {
    return { ok: false, command: "gh", output: "gh CLI not available" };
  }
  const auth = run("gh", ["auth", "status"], appDir);
  if (!auth.ok) {
    return { ok: false, command: "gh auth status", output: "gh not authenticated" };
  }
  const args = ["release", "create", version, notesFile, "--title", version];
  if (!finalRelease) {
    args.push("--prerelease");
  }
  const created = run("gh", args, appDir);
  if (created.ok) {
    return created;
  }
  if (/already exists/i.test(created.output)) {
    return run("gh", ["release", "edit", version, "--notes-file", notesFile, "--title", version], appDir);
  }
  return created;
}

export type AppLifecycleResult = {
  qualityPassed: boolean;
  deployPrepared: boolean;
  gitPrepared: boolean;
  githubPublished: boolean;
  summary: string[];
  qualityDiagnostics: string[];
};

export type PublishOutcome = {
  published: boolean;
  summary: string;
};

export type ReleaseOutcome = {
  created: boolean;
  version: string;
  summary: string;
};

export type RuntimeStartOutcome = {
  started: boolean;
  processes: Array<{ command: string; cwd: string; pid: number }>;
  summary: string;
};

export function runAppLifecycle(projectRoot: string, projectName: string, context?: LifecycleContext): AppLifecycleResult {
  const appDir = path.join(projectRoot, "generated-app");
  const summary: string[] = [];
  const repoMetadata = deriveRepoMetadata(projectName, appDir, context);
  if (process.env.SDD_DISABLE_APP_LIFECYCLE === "1") {
    return {
      qualityPassed: false,
      deployPrepared: false,
      gitPrepared: false,
      githubPublished: false,
      summary: ["Lifecycle disabled by SDD_DISABLE_APP_LIFECYCLE=1"],
      qualityDiagnostics: ["Lifecycle disabled by SDD_DISABLE_APP_LIFECYCLE=1"]
    };
  }
  if (!fs.existsSync(appDir)) {
    return {
      qualityPassed: false,
      deployPrepared: false,
      gitPrepared: false,
      githubPublished: false,
      summary: ["generated-app directory missing"],
      qualityDiagnostics: ["generated-app directory missing"]
    };
  }

  const qualitySteps: StepResult[] = [];
  qualitySteps.push(preflightQualityCheck(appDir));
  const install = packageNeedsInstall(appDir) ? run("npm", ["install"], appDir) : null;
  if (install) qualitySteps.push(install);
  const lint = runIfScript(appDir, "lint");
  if (lint) qualitySteps.push(lint);
  const test = runIfScript(appDir, "test");
  if (test) qualitySteps.push(test);
  const build = runIfScript(appDir, "build");
  if (build) qualitySteps.push(build);

  const backendDir = path.join(appDir, "backend");
  if (fs.existsSync(path.join(backendDir, "pom.xml"))) {
    if (hasCommand("mvn")) {
      qualitySteps.push(run("mvn", ["-q", "test"], backendDir));
    } else {
      qualitySteps.push({
        ok: false,
        command: "mvn -q test",
        output: "Maven not available to validate Java backend"
      });
    }
  }

  const frontendDir = path.join(appDir, "frontend");
  if (fs.existsSync(path.join(frontendDir, "package.json"))) {
    if (packageNeedsInstall(frontendDir)) {
      qualitySteps.push(run("npm", ["install"], frontendDir));
    }
    const feLint = runIfScript(frontendDir, "lint");
    if (feLint) qualitySteps.push(feLint);
    const feTest = runIfScript(frontendDir, "test");
    if (feTest) qualitySteps.push(feTest);
    const feBuild = runIfScript(frontendDir, "build");
    if (feBuild) qualitySteps.push(feBuild);
    const feSmokeScript = hasSmokeScript(frontendDir);
    if (feSmokeScript) {
      qualitySteps.push(run("npm", ["run", feSmokeScript], frontendDir));
    }
  }
  const rootSmokeScript = hasSmokeScript(appDir);
  if (rootSmokeScript) {
    qualitySteps.push(run("npm", ["run", rootSmokeScript], appDir));
  } else if (parseGoalProfile(context).apiLikeApp) {
    qualitySteps.push({
      ok: false,
      command: "smoke-check",
      output: "Missing smoke script for API-like app (expected npm script: smoke|test:smoke|e2e)."
    });
  }

  qualitySteps.push(advancedQualityCheck(appDir, context));
  if (qualitySteps.length === 0) {
    qualitySteps.push(basicQualityCheck(appDir));
  }
  const qualityPassed = qualitySteps.every((step) => step.ok);
  const qualityDiagnostics = qualitySteps
    .filter((step) => !step.ok)
    .map((step) => `${step.command}: ${step.output || "no output"}`);
  qualitySteps.forEach((step) =>
    summary.push(`${step.ok ? "OK" : "FAIL"}: ${step.command}${step.ok || !step.output ? "" : ` -> ${step.output}`}`)
  );

  const deploy = createDeployBundle(appDir);
  summary.push(`${deploy.ok ? "OK" : "FAIL"}: ${deploy.command}`);

  const git = ensureGitRepo(appDir);
  summary.push(`${git.ok ? "OK" : "FAIL"}: ${git.command}`);

  const config = ensureConfig();
  const deferPublishUntilReview = context?.deferPublishUntilReview === true;
  const publish = !config.git.publish_enabled
    ? { ok: false, command: "publish", output: "disabled by config git.publish_enabled=false" }
    : deferPublishUntilReview
      ? { ok: false, command: "publish", output: "deferred until digital review approval" }
    : !qualityPassed
      ? { ok: false, command: "publish", output: "skipped because quality checks failed" }
    : git.ok
      ? tryPublishGitHub(appDir, repoMetadata)
      : { ok: false, command: "publish", output: "skipped due to git failure" };
  summary.push(`${publish.ok ? "OK" : "SKIP"}: ${publish.command} ${publish.output ? `(${publish.output})` : ""}`.trim());

  const reportPath = path.join(appDir, "deploy", "lifecycle-report.md");
  const reportLines = [
    "# Lifecycle Report",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    ...summary.map((line) => `- ${line}`)
  ];
  fs.writeFileSync(reportPath, `${reportLines.join("\n")}\n`, "utf-8");

  return {
    qualityPassed,
    deployPrepared: deploy.ok,
    gitPrepared: git.ok,
    githubPublished: publish.ok,
    summary,
    qualityDiagnostics
  };
}

export function publishGeneratedApp(projectRoot: string, projectName: string, context?: LifecycleContext): PublishOutcome {
  const appDir = path.join(projectRoot, "generated-app");
  if (!fs.existsSync(appDir)) {
    return { published: false, summary: "generated-app directory missing" };
  }
  const config = ensureConfig();
  if (!config.git.publish_enabled) {
    return { published: false, summary: "publish disabled by config git.publish_enabled=false" };
  }
  const git = ensureGitRepo(appDir);
  if (!git.ok) {
    return { published: false, summary: `git preparation failed: ${git.output || git.command}` };
  }
  const repoMetadata = deriveRepoMetadata(projectName, appDir, context);
  const publish = tryPublishGitHub(appDir, repoMetadata);
  return {
    published: publish.ok,
    summary: publish.ok ? publish.command : `${publish.command}: ${publish.output || "publish failed"}`
  };
}

export function createManagedRelease(
  projectRoot: string,
  projectName: string,
  options: { round: number; finalRelease: boolean; note: string; context?: LifecycleContext }
): ReleaseOutcome {
  const appDir = path.join(projectRoot, "generated-app");
  if (!fs.existsSync(appDir)) {
    return { created: false, version: "n/a", summary: "generated-app directory missing" };
  }
  const git = ensureGitRepo(appDir);
  if (!git.ok) {
    return { created: false, version: "n/a", summary: `git preparation failed: ${git.output || git.command}` };
  }
  const metadata = deriveRepoMetadata(projectName, appDir, options.context);
  const version = nextManagedVersion(appDir, options.finalRelease, options.round);
  const stage: "candidate" | "final" = options.finalRelease ? "final" : "candidate";
  const releaseNote = writeReleaseNote(appDir, version, stage, options.note);
  run("git", ["add", "."], appDir);
  const commit = run("git", ["commit", "-m", `chore(release): ${version}`], appDir);
  if (!commit.ok && !/nothing to commit/i.test(commit.output)) {
    return { created: false, version, summary: `${commit.command}: ${commit.output || "release commit failed"}` };
  }
  const tag = createGitTag(appDir, version, options.note);
  if (!tag.ok) {
    return { created: false, version, summary: `${tag.command}: ${tag.output || "tag creation failed"}` };
  }

  const config = ensureConfig();
  let pushed = false;
  let published = false;
  let publishSummary = "local release created";
  if (config.git.publish_enabled) {
    const remote = ensureRepoRemote(appDir, metadata);
    if (remote.ok) {
      const pushedStep = pushGitWithTags(appDir);
      pushed = pushedStep.ok;
      publishSummary = pushedStep.ok ? "pushed main and tags" : `${pushedStep.command}: ${pushedStep.output || "push failed"}`;
      if (pushedStep.ok) {
        const ghRelease = publishGitHubRelease(appDir, version, releaseNote, options.finalRelease);
        published = ghRelease.ok;
        publishSummary = ghRelease.ok ? `${publishSummary}; github release published` : `${publishSummary}; ${ghRelease.command}: ${ghRelease.output || "release publish failed"}`;
      }
    } else {
      publishSummary = `${remote.command}: ${remote.output || "remote setup failed"}`;
    }
  }

  appendReleaseHistory(appDir, {
    version,
    stage,
    note: options.note,
    pushed,
    published
  });

  return {
    created: true,
    version,
    summary: publishSummary
  };
}

function resolveStartScripts(appDir: string): Array<{ cwd: string; script: string }> {
  const scripts: Array<{ cwd: string; script: string }> = [];
  const collect = (cwd: string): void => {
    const pkg = readPackageJson(cwd);
    if (!pkg?.scripts) {
      return;
    }
    if (typeof pkg.scripts.start === "string") {
      scripts.push({ cwd, script: "start" });
      return;
    }
    if (typeof pkg.scripts.dev === "string") {
      scripts.push({ cwd, script: "dev" });
    }
  };
  collect(appDir);
  if (scripts.length > 0) {
    return scripts.slice(0, 1);
  }
  collect(path.join(appDir, "backend"));
  collect(path.join(appDir, "frontend"));
  return scripts.slice(0, 2);
}

export function startGeneratedApp(projectRoot: string, _projectName: string): RuntimeStartOutcome {
  const appDir = path.join(projectRoot, "generated-app");
  if (!fs.existsSync(appDir)) {
    return { started: false, processes: [], summary: "generated-app directory missing" };
  }
  const scripts = resolveStartScripts(appDir);
  if (scripts.length === 0) {
    return { started: false, processes: [], summary: "No start/dev script found to run application." };
  }
  const processes: Array<{ command: string; cwd: string; pid: number }> = [];
  for (const target of scripts) {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(command, ["run", target.script], {
      cwd: target.cwd,
      shell: process.platform === "win32",
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    if (typeof child.pid === "number") {
      processes.push({
        command: `${command} run ${target.script}`,
        cwd: target.cwd,
        pid: child.pid
      });
    }
  }
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const runtimeFile = path.join(deployDir, "runtime-processes.json");
  fs.writeFileSync(
    runtimeFile,
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        processes
      },
      null,
      2
    ),
    "utf-8"
  );
  if (processes.length === 0) {
    return { started: false, processes: [], summary: "Failed to spawn runtime process." };
  }
  return {
    started: true,
    processes,
    summary: `Started ${processes.length} runtime process(es); details: ${runtimeFile}`
  };
}
