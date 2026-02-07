const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const { setFlags } = require("../dist/context/flags.js");
const {
  ensureProject,
  ensureWorkspace,
  getWorkspaceInfo,
  listProjects,
  normalizeProjectName,
  normalizeScopeName
} = require("../dist/workspace/index.js");

test("normalizeProjectName accepts valid names", () => {
  assert.equal(normalizeProjectName("My Project_1"), "My Project_1");
  assert.equal(normalizeProjectName("Alpha-42"), "Alpha-42");
});

test("normalizeProjectName rejects path traversal", () => {
  assert.throws(() => normalizeProjectName("../secrets"), /path separators/i);
  assert.throws(() => normalizeProjectName(".."), /path separators/i);
});

test("normalizeProjectName rejects unsupported characters", () => {
  assert.throws(() => normalizeProjectName("Bad/Name"), /path separators/i);
  assert.throws(() => normalizeProjectName("Bad@Name"), /letters, numbers/i);
});

test("normalizeScopeName validates allowed characters", () => {
  assert.equal(normalizeScopeName("apps-web"), "apps-web");
  assert.throws(() => normalizeScopeName("../bad"), /path separators/i);
  assert.throws(() => normalizeScopeName("bad@scope"), /letters, numbers/i);
});

test("getWorkspaceInfo nests workspace under --scope", () => {
  const output = path.join(os.tmpdir(), "sdd-scope-test");
  setFlags({ output, scope: "payments" });
  const info = getWorkspaceInfo();
  assert.equal(info.root, path.join(output, "payments"));
  assert.equal(info.indexPath, path.join(output, "payments", "workspaces.json"));
  setFlags({ output: undefined, scope: undefined });
});

test("ensureProject recovers from stale workspace lock file", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-lock-test-"));
  setFlags({ output, scope: undefined });
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);

  const lockPath = `${workspace.indexPath}.lock`;
  fs.writeFileSync(lockPath, "stale", "utf-8");
  const old = new Date(Date.now() - 120000);
  fs.utimesSync(lockPath, old, old);

  ensureProject(workspace, "LockProject", "software");
  const projects = listProjects(workspace);
  assert.equal(projects.some((project) => project.name === "LockProject"), true);
  assert.equal(fs.existsSync(lockPath), false);

  setFlags({ output: undefined, scope: undefined });
});
