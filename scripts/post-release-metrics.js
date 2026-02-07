#!/usr/bin/env node
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
  const errorMessage = result.error ? String(result.error.message || result.error) : "";
  return {
    ok: result.status === 0 && !result.error,
    status: typeof result.status === "number" ? result.status : -1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    errorMessage
  };
}

function summarizeBlock(title, result) {
  const lines = [];
  lines.push(`## ${title}`);
  lines.push(`- status: ${result.ok ? "pass" : `fail (${result.status})`}`);
  if (result.stdout.trim()) {
    const firstLines = result.stdout
      .trim()
      .split(/\r?\n/)
      .slice(-6)
      .join("\n");
    lines.push("```text");
    lines.push(firstLines);
    lines.push("```");
  }
  if (!result.ok && result.stderr.trim()) {
    lines.push("```text");
    lines.push(result.stderr.trim().split(/\r?\n/).slice(0, 8).join("\n"));
    lines.push("```");
  }
  if (!result.ok && result.errorMessage) {
    lines.push("```text");
    lines.push(result.errorMessage);
    lines.push("```");
  }
  return lines.join("\n");
}

function main() {
  const generatedAt = new Date().toISOString();
  const checks = [
    { title: "Build", command: "npm", args: ["run", "build"] },
    { title: "Tests", command: "npm", args: ["test"] },
    { title: "Docs consistency", command: "npm", args: ["run", "check:docs"] },
    { title: "Autopilot smoke", command: "npm", args: ["run", "smoke:autopilot"] }
  ];

  const results = checks.map((check) => ({
    ...check,
    result: run(check.command, check.args)
  }));

  const failed = results.filter((entry) => !entry.result.ok);
  const out = [];
  out.push("# Post-release Metrics Summary");
  out.push("");
  out.push(`Generated: ${generatedAt}`);
  out.push(`Overall: ${failed.length === 0 ? "pass" : `fail (${failed.length} checks failed)`}`);
  out.push("");

  for (const entry of results) {
    out.push(summarizeBlock(entry.title, entry.result));
    out.push("");
  }

  process.stdout.write(`${out.join("\n").trimEnd()}\n`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
