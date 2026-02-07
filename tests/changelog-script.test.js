const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("release:changelog moves Unreleased notes into a new version section", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-changelog-"));
  const changelogPath = path.join(tmp, "CHANGELOG.md");
  const releasesDir = path.join(tmp, "releases");
  fs.mkdirSync(releasesDir, { recursive: true });
  fs.writeFileSync(
    changelogPath,
    [
      "# Changelog",
      "",
      "## Unreleased",
      "- Add feature A",
      "- Fix issue B",
      "",
      "## 0.1.6",
      "- Old changes"
    ].join("\n"),
    "utf-8"
  );
  fs.writeFileSync(path.join(releasesDir, "v0.1.20.md"), "# Release Notes\n", "utf-8");
  fs.writeFileSync(path.join(releasesDir, "v0.1.20-metrics.md"), "# Metrics\n", "utf-8");

  const scriptPath = path.join(__dirname, "..", "scripts", "update-changelog.js");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--version", "v0.1.20", "--changelog", changelogPath, "--notes", path.join(releasesDir, "v0.1.20.md")],
    { encoding: "utf-8" }
  );

  assert.equal(result.status, 0);
  const content = fs.readFileSync(changelogPath, "utf-8");
  assert.match(content, /## Unreleased\n- None\./);
  assert.match(content, /## 0\.1\.20/);
  assert.match(content, /- Add feature A/);
  assert.match(content, /- Fix issue B/);
  assert.match(content, /docs\/releases|releases\/v0\.1\.20\.md/);
});
