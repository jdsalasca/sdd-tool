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

test("deriveRepoMetadata prefers project/goal over generated README title", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-meta-"));
  const appDir = path.join(root, "generated-app");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "README.md"), "# sdd-cli\nThis is unrelated text.\n", "utf-8");

  const metadata = __internal.deriveRepoMetadata("autopilot-create-medical-booking-20260208", appDir, {
    goalText: "create a medical appointments app for hospitals"
  });

  assert.equal(metadata.repoName, "medical-appointments-hospitals-app");
  assert.match(metadata.description, /medical appointments app/i);
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
    assert.equal(
      result.qualityDiagnostics.some(
        (line) => /Intent alignment failed/i.test(line) || /Missing SQL schema file/i.test(line)
      ),
      true
    );
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
      "@Test void a(){} @Test void b(){} @Test void c(){} @Test void d(){} @Test void e(){}",
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
