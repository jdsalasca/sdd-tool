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
};

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
  if (process.platform === "win32" && command === "npm") {
    resolved = "npm.cmd";
  }
  const useShell = process.platform === "win32" && resolved.toLowerCase().endsWith(".cmd");
  const result = useShell
    ? spawnSync([resolved, ...args].join(" "), { cwd, encoding: "utf-8", shell: true })
    : spawnSync(resolved, args, { cwd, encoding: "utf-8", shell: false });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
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

function packageNeedsInstall(cwd: string): boolean {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const depCount = Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length;
    return depCount > 0;
  } catch {
    return false;
  }
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
  const base = projectSeed || intentSeed || "sdd-project";
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
