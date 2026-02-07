#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function run(command, args) {
  let executable = command;
  let finalArgs = args;
  if (command === "npm") {
    const npmExecPath = process.env.npm_execpath || "";
    if (npmExecPath) {
      executable = process.execPath;
      finalArgs = [npmExecPath, ...args];
    } else if (process.platform === "win32") {
      executable = "npm.cmd";
    }
  }
  const result = spawnSync(executable, finalArgs, { encoding: "utf-8" });
  return result;
}

function fail(code, message) {
  console.error(`[${code}] ${message}`);
  process.exit(1);
}

function main() {
  const pkgPath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(pkgPath)) {
    fail("SDD-3010", "package.json not found.");
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (!pkg.description || String(pkg.description).trim().length < 20) {
    fail("SDD-3011", "Package description is too short.");
  }
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    fail("SDD-3012", "package.json files field must declare publish bundle paths.");
  }

  const build = run("npm", ["run", "build"]);
  if (build.status !== 0) {
    process.stderr.write(build.stderr || "");
    fail("SDD-3013", "Build failed during publish verification.");
  }

  const pack = run("npm", ["pack", "--dry-run", "--json"]);
  if (pack.status !== 0) {
    process.stderr.write(pack.stderr || "");
    fail("SDD-3014", "npm pack --dry-run failed.");
  }

  let report;
  try {
    report = JSON.parse(pack.stdout || "[]");
  } catch {
    fail("SDD-3015", "Unable to parse npm pack JSON output.");
  }
  if (!Array.isArray(report) || report.length === 0) {
    fail("SDD-3016", "npm pack report is empty.");
  }
  const files = report[0]?.files || [];
  const filePaths = new Set(files.map((entry) => String(entry.path || "")));
  const required = ["dist/cli.js", "dist/cli.d.ts", "package.json", "README.md"];
  const missing = required.filter((item) => !filePaths.has(item));
  if (missing.length > 0) {
    fail("SDD-3017", `Required publish files missing: ${missing.join(", ")}`);
  }

  console.log("Publish verification passed.");
}

main();
