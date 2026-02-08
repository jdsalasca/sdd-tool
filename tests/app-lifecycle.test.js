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

  assert.equal(metadata.repoName, "create-medical-booking-app");
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
    assert.equal(result.qualityDiagnostics.some((line) => /Intent alignment failed/i.test(line)), true);
  }));
