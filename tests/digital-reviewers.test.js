const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runDigitalHumanReview, writeDigitalReviewReport } = require("../dist/commands/digital-reviewers.js");

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

test("digital reviewers flag missing product and QA quality", () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-digital-review-fail-"));
  write(path.join(appDir, "README.md"), "# App\n\nNo sections.\n");
  write(path.join(appDir, "src", "index.ts"), "export const ok = true;");

  const result = runDigitalHumanReview(appDir, {
    goalText: "create a notes app",
    intentDomain: "software"
  });

  assert.equal(result.passed, false);
  assert.equal(result.diagnostics.some((line) => /qa_engineer/i.test(line)), true);
  assert.equal(result.diagnostics.some((line) => /program_manager/i.test(line)), true);
  assert.equal(result.score < result.threshold, true);
});

test("digital reviewers approve strong delivery baseline", () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-digital-review-pass-"));
  write(
    path.join(appDir, "README.md"),
    [
      "# Notes App",
      "",
      "## Features",
      "- Create notes",
      "- Persist notes",
      "- Search notes",
      "",
      "## Run",
      "- npm run dev",
      "",
      "## User flow",
      "- user can add, edit, and remove notes"
    ].join("\n")
  );
  write(path.join(appDir, "user-flow.md"), "# User Flow\n- add note\n- edit note\n");
  write(path.join(appDir, "architecture.md"), "# Architecture\n- layers\n");
  write(path.join(appDir, "execution-guide.md"), "# Execution Guide\n- run local\n");
  write(path.join(appDir, "LICENSE"), "MIT License");
  write(path.join(appDir, "tests", "a.test.js"), "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});");
  write(path.join(appDir, "tests", "b.test.js"), "test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});");

  const result = runDigitalHumanReview(appDir, {
    goalText: "create a notes app",
    intentDomain: "software"
  });

  assert.equal(result.passed, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.score >= result.threshold, true);
});

test("digital reviewers enforce legal artifacts in legal domain", () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-digital-review-legal-"));
  write(
    path.join(appDir, "README.md"),
    "# Legal Project\n\n## Features\n- compliance workflow\n\n## Run\n- npm start\n\n## User flow\n- submit case\n"
  );
  write(path.join(appDir, "tests", "a.test.js"), "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});");
  write(path.join(appDir, "tests", "b.test.js"), "test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});");

  const result = runDigitalHumanReview(appDir, {
    goalText: "legal compliance project",
    intentDomain: "legal"
  });

  assert.equal(result.passed, false);
  assert.equal(result.diagnostics.some((line) => /compliance_officer/i.test(line)), true);
});

test("digital review writes machine-readable report", () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-digital-review-report-"));
  write(path.join(appDir, "README.md"), "# App\n\n## Features\n- x\n\n## Run\n- npm start\n\n## User flow\n- x\n");
  write(path.join(appDir, "architecture.md"), "# Architecture\n- layers\n");
  write(path.join(appDir, "execution-guide.md"), "# Execution Guide\n- run\n");
  write(path.join(appDir, "LICENSE"), "MIT License");
  write(path.join(appDir, "tests", "a.test.js"), "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});");
  write(path.join(appDir, "tests", "b.test.js"), "test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});");
  const review = runDigitalHumanReview(appDir, { goalText: "create app" });
  const reportPath = writeDigitalReviewReport(appDir, review);
  assert.equal(typeof reportPath, "string");
  assert.equal(fs.existsSync(reportPath), true);
  const raw = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  assert.equal(typeof raw.score, "number");
  assert.equal(typeof raw.threshold, "number");
  assert.equal(typeof raw.summary, "string");
});
