const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runDigitalHumanReview } = require("../dist/commands/digital-reviewers.js");

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
  write(path.join(appDir, "tests", "a.test.js"), "test('a',()=>{});test('b',()=>{});test('c',()=>{});test('d',()=>{});");
  write(path.join(appDir, "tests", "b.test.js"), "test('e',()=>{});test('f',()=>{});test('g',()=>{});test('h',()=>{});");

  const result = runDigitalHumanReview(appDir, {
    goalText: "create a notes app",
    intentDomain: "software"
  });

  assert.equal(result.passed, true);
  assert.equal(result.diagnostics.length, 0);
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

