import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
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
};

type GoalProfile = {
  javaReactFullstack: boolean;
  relationalDataApp: boolean;
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
        if ([".git", "node_modules", "dist", "build", "target", "__pycache__", ".venv", "venv"].includes(entry.name.toLowerCase())) {
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
        if ([".git", "node_modules", "dist", "build", "target", "__pycache__"].includes(entry.name)) {
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
        if ([".git", "node_modules", "dist", "build", "target", "__pycache__", ".venv", "venv"].includes(entry.name.toLowerCase())) {
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

function readPackageJson(cwd: string): { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
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
    relationalDataApp
  };
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

  if (testCount < 5) {
    return {
      ok: false,
      command: "advanced-quality-check",
      output: `Expected at least 5 tests, found ${testCount}`
    };
  }
  const readme = fs.readFileSync(readmePath, "utf-8").toLowerCase();
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
    "sistema",
    "gestion",
    "management"
  ]);
  const normalized = normalizeText(input);
  const tokens = normalized.split(/[^a-z0-9]+/g).filter((token) => token.length >= 3 && !stopwords.has(token));
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
    .replace(/-\d{8}$/g, "")
    .replace(/-generated-app$/g, "")
    .trim();
  const goalSeed = context?.goalText ? tokenizeIntent(context.goalText).slice(0, 6).join("-") : "";
  const projectSeed = slugify(rawBase);
  const intentSeed = slugify(goalSeed);
  const base = intentSeed || projectSeed || "sdd-project";
  const cleaned = base.replace(/-app$/g, "");
  const repoName = `${cleaned}-app`.slice(0, 63).replace(/-+$/g, "");

  let description = context?.goalText?.trim()
    ? `Generated with sdd-tool: ${context.goalText.trim().slice(0, 150)}`
    : `Production-ready app generated by sdd-tool for ${projectName}.`;
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

export type AppLifecycleResult = {
  qualityPassed: boolean;
  deployPrepared: boolean;
  gitPrepared: boolean;
  githubPublished: boolean;
  summary: string[];
  qualityDiagnostics: string[];
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
  const publish = !config.git.publish_enabled
    ? { ok: false, command: "publish", output: "disabled by config git.publish_enabled=false" }
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
