const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ensureConfig, loadConfig, updateConfigValue } = require("../dist/config/index.js");
const { getWorkspaceBaseRoot } = require("../dist/workspace/index.js");
const { setFlags } = require("../dist/context/flags.js");

test("ensureConfig creates config.yml and workspace default root", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-config-"));
  const configFile = path.join(tmp, "config.yml");
  process.env.SDD_CONFIG_PATH = configFile;

  const config = ensureConfig();
  assert.equal(fs.existsSync(configFile), true);
  assert.equal(fs.existsSync(config.workspace.default_root), true);

  delete process.env.SDD_CONFIG_PATH;
});

test("workspace base root uses config workspace.default_root when --output is not set", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-config-root-"));
  const configFile = path.join(tmp, "config.yml");
  process.env.SDD_CONFIG_PATH = configFile;

  const nextRoot = path.join(tmp, "projects");
  const updated = updateConfigValue("workspace.default_root", nextRoot);
  assert.equal(updated.workspace.default_root, path.resolve(nextRoot));

  setFlags({ output: undefined });
  const root = getWorkspaceBaseRoot();
  assert.equal(root, path.resolve(nextRoot));

  delete process.env.SDD_CONFIG_PATH;
});

test("updateConfigValue sets provider and mode defaults", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-config-provider-"));
  process.env.SDD_CONFIG_PATH = path.join(tmp, "config.yml");

  updateConfigValue("ai.preferred_cli", "codex");
  updateConfigValue("mode.default", "non-interactive");
  updateConfigValue("git.publish_enabled", "true");
  updateConfigValue("git.release_management_enabled", "true");
  updateConfigValue("git.run_after_finalize", "true");
  updateConfigValue("git.flow_enabled", "true");
  const config = loadConfig();

  assert.equal(config.ai.preferred_cli, "codex");
  assert.equal(config.mode.default, "non-interactive");
  assert.equal(config.git.publish_enabled, true);
  assert.equal(config.git.release_management_enabled, true);
  assert.equal(config.git.run_after_finalize, true);
  assert.equal(config.git.flow_enabled, true);

  delete process.env.SDD_CONFIG_PATH;
});
