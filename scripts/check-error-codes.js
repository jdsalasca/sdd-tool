#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const TARGET_FILES = [
  "src/commands/import-issue.ts",
  "src/commands/import-jira.ts",
  "src/commands/req-create.ts",
  "src/commands/req-plan.ts",
  "src/commands/req-start.ts",
  "src/commands/req-finish.ts",
  "src/commands/pr-start.ts",
  "src/commands/pr-bridge.ts",
  "src/commands/pr-respond.ts",
  "src/commands/pr-audit.ts",
  "src/commands/pr-report.ts",
  "src/commands/pr-finish.ts",
  "src/commands/doctor.ts"
];

const ERROR_HINTS = ["required", "invalid", "failed", "not found", "missing", "cannot"];

function isRawErrorLog(line) {
  if (!line.includes("console.log(")) {
    return false;
  }
  if (line.includes("[SDD-")) {
    return false;
  }
  const lower = line.toLowerCase();
  return ERROR_HINTS.some((hint) => lower.includes(hint));
}

function main() {
  const violations = [];
  for (const file of TARGET_FILES) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) {
      continue;
    }
    const lines = fs.readFileSync(full, "utf-8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isRawErrorLog(line)) {
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  if (violations.length > 0) {
    console.error("Error-code check failed. Use printError(...) with SDD-xxxx for error paths:");
    violations.forEach((v) => console.error(`- ${v}`));
    process.exit(1);
  }
  console.log("Error-code check OK.");
}

main();
