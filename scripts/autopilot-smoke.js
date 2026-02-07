const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function run() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-smoke-"));
  const cliPath = path.join(process.cwd(), "dist", "cli.js");
  const args = [cliPath, "--output", workspaceRoot, "--non-interactive", "hello", "Build a smoke-test feature"];
  const result = spawnSync(process.execPath, args, { encoding: "utf-8", env: process.env });

  if (result.status !== 0) {
    console.error("Autopilot smoke failed with non-zero exit code.");
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status || 1);
  }

  if (!/Autopilot completed successfully/i.test(result.stdout)) {
    console.error("Autopilot smoke missing completion message.");
    console.error(result.stdout);
    process.exit(1);
  }

  console.log("Autopilot smoke OK.");
}

run();
