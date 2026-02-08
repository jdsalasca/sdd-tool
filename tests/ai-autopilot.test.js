const test = require("node:test");
const assert = require("node:assert/strict");

const { __internal } = require("../dist/commands/ai-autopilot.js");

test("extractFilesFromParsed accepts alternative file key shapes", () => {
  const parsed = {
    artifacts: [
      { filePath: "src/app.ts", code: "export const ok = true;" },
      { filename: "README.md", text: "# App" }
    ]
  };
  const files = __internal.extractFilesFromParsed(parsed);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, "src/app.ts");
  assert.match(files[0].content, /ok = true/);
});

test("extractFilesFromParsed unwraps nested result payload", () => {
  const parsed = {
    result: {
      files: [{ path: "docs/notes.md", content: "hello" }]
    }
  };
  const files = __internal.extractFilesFromParsed(parsed);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "docs/notes.md");
});

test("parseFilesFromRawText extracts FILE:path fenced blocks", () => {
  const raw = [
    "FILE: src/main.ts",
    "```ts",
    "console.log('ok');",
    "```",
    "",
    "FILE: README.md",
    "```md",
    "# Demo",
    "```"
  ].join("\n");
  const files = __internal.parseFilesFromRawText(raw);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, "src/main.ts");
  assert.match(files[0].content, /console\.log/);
});

test("extractJsonObject can parse fenced json response", () => {
  const raw = ["text", "```json", '{"files":[{"path":"a.txt","content":"x"}]}', "```"].join("\n");
  const parsed = __internal.extractJsonObject(raw);
  assert.equal(typeof parsed, "object");
  const files = __internal.extractFilesFromParsed(parsed);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "a.txt");
});
