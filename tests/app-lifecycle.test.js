const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runAppLifecycle, __internal } = require("../dist/commands/app-lifecycle.js");

function withTempConfig(fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-config-"));
  const configPath = path.join(tempRoot, "config.yml");
  const prev = process.env.SDD_CONFIG_PATH;
  process.env.SDD_CONFIG_PATH = configPath;
  try {
    return fn(tempRoot);
  } finally {
    if (typeof prev === "string") {
      process.env.SDD_CONFIG_PATH = prev;
    } else {
      delete process.env.SDD_CONFIG_PATH;
    }
  }
}

function buildSourceModule(name, count) {
  const lines = [`function ${name}Base(input) {`, "  const value = Number(input || 0);", "  return Number.isFinite(value) ? value : 0;", "}", ""];
  for (let i = 0; i < count; i += 1) {
    lines.push(`export function ${name}Feature${i}(left, right) {`);
    lines.push("  const a = " + `${name}Base(left);`);
    lines.push("  const b = " + `${name}Base(right);`);
    lines.push(`  return a + b + ${i};`);
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n");
}

test("deriveRepoMetadata prefers project/goal over generated README title", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-meta-"));
  const appDir = path.join(root, "generated-app");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "README.md"), "# sdd-cli\nThis is unrelated text.\n", "utf-8");

  const metadata = __internal.deriveRepoMetadata("autopilot-create-medical-booking-20260208", appDir, {
    goalText: "create a medical appointments app for hospitals"
  });

  assert.equal(metadata.repoName, "medical-appointments-hospitals-platform");
  assert.match(metadata.description, /production-ready/i);
});

test("runAppLifecycle fails quality when generated app is not aligned with request intent", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });

    fs.writeFileSync(
      path.join(appDir, "README.md"),
      [
        "# SDD CLI",
        "",
        "## Features",
        "- Command-based requirement orchestration.",
        "",
        "## Testing",
        "- Run tests with npm test.",
        "",
        "## Run",
        "- npm start",
        "",
        "Regression notes included below."
      ].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- cli_event\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- local stubs\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- smoke\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(
      path.join(appDir, "src", "core.test.js"),
      "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});",
      "utf-8"
    );

    const result = runAppLifecycle(root, "autopilot-clinic-appointments-20260208", {
      goalText: "crear app de gestion de citas medicas para hospital",
      intentSignals: ["citas", "medicas", "hospital"]
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(result.qualityDiagnostics.length > 0, true);
  }));

test("runAppLifecycle requires schema.sql for relational-data goals", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });

    fs.writeFileSync(
      path.join(appDir, "README.md"),
      [
        "# Library System",
        "",
        "## Features",
        "- users, books, loans, inventory management",
        "",
        "## Testing",
        "- Run tests using backend tooling",
        "",
        "## Run",
        "- start backend and frontend locally",
        "",
        "Database: PostgreSQL for production."
      ].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- user\n- loan\n- inventory\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- local database stubs\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- API and UI scenarios\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(
      path.join(appDir, "src", "service.test.java"),
      "@Test void a(){} @Test void b(){} @Test void c(){} @Test void d(){} @Test void e(){} @Test void f(){} @Test void g(){} @Test void h(){}",
      "utf-8"
    );

    const result = runAppLifecycle(root, "autopilot-library-system-20260208", {
      goalText: "create a library system with users, loans, books and inventory"
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(
      result.qualityDiagnostics.some((line) => /Missing SQL schema file/i.test(line)),
      true
    );
  }));

test("runAppLifecycle enforces Java+React architecture layers", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "backend", "src", "main", "java", "com", "example", "service"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "backend", "src", "main", "java", "com", "example", "repository"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "frontend", "src", "api"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "frontend", "src", "hooks"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "frontend", "src", "components"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "frontend", "src", "__tests__"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });

    fs.writeFileSync(path.join(appDir, "backend", "pom.xml"), "<project></project>", "utf-8");
    fs.writeFileSync(
      path.join(appDir, "frontend", "package.json"),
      JSON.stringify(
        {
          name: "frontend",
          version: "1.0.0",
          dependencies: {
            react: "^18.0.0",
            "@tanstack/react-query": "^5.0.0"
          }
        },
        null,
        2
      ),
      "utf-8"
    );

    fs.writeFileSync(
      path.join(appDir, "README.md"),
      ["# Java React App", "## Features", "- fullstack", "## Testing", "- tests", "## Run", "- run app"].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- item\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- stubs\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- checks\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "core.test.js"), "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});", "utf-8");
    fs.writeFileSync(path.join(appDir, "frontend", "src", "__tests__", "a.test.ts"), "test('a',()=>{});", "utf-8");
    fs.writeFileSync(path.join(appDir, "frontend", "src", "__tests__", "b.test.ts"), "test('b',()=>{});", "utf-8");
    fs.writeFileSync(path.join(appDir, "frontend", "src", "__tests__", "c.test.ts"), "test('c',()=>{});", "utf-8");

    fs.writeFileSync(path.join(appDir, "frontend", "src", "api", "client.ts"), "export const api = {};", "utf-8");
    fs.writeFileSync(path.join(appDir, "frontend", "src", "hooks", "useItems.ts"), "export const useItems = () => [];", "utf-8");
    fs.writeFileSync(path.join(appDir, "frontend", "src", "components", "ItemCard.tsx"), "export const ItemCard = () => null;", "utf-8");

    fs.writeFileSync(path.join(appDir, "backend", "src", "main", "java", "com", "example", "service", "ItemService.java"), "public class ItemService {}", "utf-8");
    fs.writeFileSync(path.join(appDir, "backend", "src", "main", "java", "com", "example", "repository", "ItemRepository.java"), "public class ItemRepository {}", "utf-8");

    const result = runAppLifecycle(root, "autopilot-java-react-20260208", {
      goalText: "create java react dashboard for operations"
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(
      result.qualityDiagnostics.some(
        (line) =>
          /Missing Java DTO layer/i.test(line) ||
          /Missing backend dependencies for production quality/i.test(line) ||
          /mvn(\.cmd)? -q test/i.test(line)
      ),
      true
    );
  }));

test("runAppLifecycle enforces legal domain artifact quality", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "README.md"),
      ["# Legal Intake", "## Features", "- legal intake workflow", "## Testing", "- run npm test", "## Run", "- npm start"].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- case\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "components.md"), "# Components\n- risk_controller\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "architecture.md"), "# Architecture\n- MVC: model/controller/view\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- stubs\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- checks\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(
      path.join(appDir, "src", "core.test.js"),
      "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});",
      "utf-8"
    );

    const result = runAppLifecycle(root, "autopilot-legal-intake-20260208", {
      goalText: "build legal contract risk assistant",
      intentDomain: "legal"
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(
      result.qualityDiagnostics.some(
        (line) => /Missing legal artifacts/i.test(line) || /Expected at least 8 tests/i.test(line)
      ),
      true
    );
  }));

test("runAppLifecycle enforces data-science domain artifact quality", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "README.md"),
      ["# Demand Forecast", "## Features", "- train and evaluate model", "## Testing", "- run npm test", "## Run", "- npm start"].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- demand_record\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "components.md"), "# Components\n- forecasting_pipeline\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "architecture.md"), "# Architecture\n- MVC: model/controller/view\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- local data stubs\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- checks\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dataset-schema.md"), "# Dataset Schema\n- record\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "evaluation-metrics.md"), "# Evaluation Metrics\n- MAE\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(
      path.join(appDir, "src", "core.test.js"),
      "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});",
      "utf-8"
    );

    const result = runAppLifecycle(root, "autopilot-demand-forecast-20260208", {
      goalText: "train demand prediction model with monitoring",
      intentDomain: "data_science"
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(
      result.qualityDiagnostics.some(
        (line) => /Missing data science artifacts/i.test(line) || /Expected at least 8 tests/i.test(line)
      ),
      true
    );
  }));

test("runAppLifecycle defers publish when digital-review defer flag is enabled", () =>
  withTempConfig((root) => {
    const configPath = process.env.SDD_CONFIG_PATH;
    fs.writeFileSync(
      configPath,
      [
        "workspace:",
        `  default_root: ${root.replace(/\\/g, "/")}`,
        "ai:",
        "  preferred_cli: gemini",
        "  model: gemini-2.5-flash-lite",
        "mode:",
        "  default: guided",
        "git:",
        "  publish_enabled: true",
        ""
      ].join("\n"),
      "utf-8"
    );

    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "README.md"),
      ["# Calculator App", "## Features", "- calculator operations", "## Testing", "- npm test", "## Run", "- npm start"].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- calc_entry\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "components.md"), "# Components\n- calc_engine\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "architecture.md"), "# Architecture\n- MVC: model/controller/view\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "mission.md"), "# Mission\n- deliver user value and reliable outcomes\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "vision.md"), "# Vision\n- future roadmap for growth and scale\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- local stubs\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- core paths\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "requirements.txt"), "fastapi==0.115.0\nuvicorn==0.30.6\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "src", "calculator.js"), buildSourceModule("calculator", 9), "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "memory.js"), buildSourceModule("memory", 9), "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "history.js"), buildSourceModule("history", 9), "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "parser.js"), buildSourceModule("parser", 9), "utf-8");
    fs.writeFileSync(
      path.join(appDir, "tests", "core.test.js"),
      "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});",
      "utf-8"
    );

    const result = runAppLifecycle(root, "autopilot-calculator-20260208", {
      goalText: "create calculator app",
      deferPublishUntilReview: true
    });

    assert.equal(result.qualityPassed, true);
    assert.equal(result.githubPublished, false);
    assert.equal(result.summary.some((line) => /deferred until digital review approval/i.test(line)), true);
  }));

test("runAppLifecycle fails software delivery when runtime manifest is missing", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "README.md"),
      ["# Inventory Platform", "## Features", "- inventory operations", "## Testing", "- npm test", "## Run", "- npm start"].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- inventory_item\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "components.md"), "# Components\n- inventory_service\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "architecture.md"), "# Architecture\n- MVC: model/controller/view\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- local storage adapter\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- inventory smoke\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "inventory.js"), buildSourceModule("inventory", 10), "utf-8");
    fs.writeFileSync(
      path.join(appDir, "tests", "core.test.js"),
      "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});",
      "utf-8"
    );

    const result = runAppLifecycle(root, "autopilot-inventory-20260210", {
      goalText: "create inventory software for stores"
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(result.qualityDiagnostics.some((line) => /missing runtime manifest/i.test(line)), true);
  }));

test("runAppLifecycle fails when README or components contain placeholder content", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "tests"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "requirements.txt"), "flask==3.0.3\n", "utf-8");
    fs.writeFileSync(
      path.join(appDir, "README.md"),
      ["# Billing Suite", "## Features", "- TODO complete features", "## Testing", "- pytest", "## Run", "- flask run"].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- invoice\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "components.md"), "# Components\n- TODO list components\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "architecture.md"), "# Architecture\n- MVC: model/controller/view\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- sqlite adapter\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- billing smoke\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "billing.js"), buildSourceModule("billing", 10), "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "tax.js"), buildSourceModule("tax", 10), "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "ledger.js"), buildSourceModule("ledger", 10), "utf-8");
    fs.writeFileSync(path.join(appDir, "src", "audit.js"), buildSourceModule("audit", 10), "utf-8");
    fs.writeFileSync(
      path.join(appDir, "tests", "core.test.js"),
      "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});",
      "utf-8"
    );

    const result = runAppLifecycle(root, "autopilot-billing-20260210", {
      goalText: "create billing management software"
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(result.qualityDiagnostics.some((line) => /placeholder\/todo/i.test(line)), true);
  }));

test("runAppLifecycle preflight fails on nested generated-app duplication", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "generated-app"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "README.md"),
      ["# Demo", "## Features", "- x", "## Testing", "- npm test", "## Run", "- npm start"].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- x\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- x\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "components.md"), "# Components\n- x\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "architecture.md"), "# Architecture\n- MVC\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- x\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(path.join(appDir, "tests", "a.test.js"), "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});", "utf-8");
    fs.writeFileSync(path.join(appDir, "generated-app", "package.json"), "{\"name\":\"nested\"}", "utf-8");

    const result = runAppLifecycle(root, "autopilot-nested-20260209", {
      goalText: "create parking registry app"
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(result.qualityDiagnostics.some((line) => /Nested generated-app\/package\.json detected/i.test(line)), true);
  }));

test("runAppLifecycle preflight fails when package leaks sdd-cli identity and missing script files", () =>
  withTempConfig((root) => {
    const appDir = path.join(root, "generated-app");
    fs.mkdirSync(path.join(appDir, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "README.md"),
      ["# Demo", "## Features", "- x", "## Testing", "- npm test", "## Run", "- npm start"].join("\n"),
      "utf-8"
    );
    fs.writeFileSync(path.join(appDir, "schemas.md"), "# Schemas\n- x\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "dummy-local.md"), "# DummyLocal\n- x\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "components.md"), "# Components\n- x\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "architecture.md"), "# Architecture\n- MVC\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "regression.md"), "# Regression\n- x\n", "utf-8");
    fs.writeFileSync(path.join(appDir, "LICENSE"), "MIT License", "utf-8");
    fs.writeFileSync(
      path.join(appDir, "tests", "a.test.js"),
      "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify(
        {
          name: "sdd-cli",
          scripts: {
            preinstall: "node scripts/preinstall.js",
            smoke: "node scripts/autopilot-smoke.js"
          }
        },
        null,
        2
      ),
      "utf-8"
    );

    const result = runAppLifecycle(root, "autopilot-script-leak-20260210", {
      goalText: "create parking registry app"
    });

    assert.equal(result.qualityPassed, false);
    assert.equal(result.qualityDiagnostics.some((line) => /must not be 'sdd-cli'/i.test(line)), true);
    assert.equal(result.qualityDiagnostics.some((line) => /references missing file/i.test(line)), true);
  }));
