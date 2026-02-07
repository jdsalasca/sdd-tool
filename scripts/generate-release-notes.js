#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }
  return process.argv[index + 1] || "";
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function run(command) {
  return execSync(command, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function latestTag() {
  try {
    return run("git describe --tags --abbrev=0");
  } catch {
    return "";
  }
}

function parseConventional(subject) {
  const match = subject.match(/^([a-z]+)(\(([^)]+)\))?(!)?:\s+(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    type: match[1].toLowerCase(),
    scope: match[3] || "",
    breaking: Boolean(match[4]),
    description: match[5]
  };
}

function collectCommits(range) {
  const output = run(`git log --no-merges --pretty=format:%s ${range}`) || "";
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toHeading(type) {
  const labels = {
    feat: "Features",
    fix: "Fixes",
    docs: "Docs",
    refactor: "Refactor",
    perf: "Performance",
    test: "Tests",
    build: "Build",
    ci: "CI",
    chore: "Chores",
    revert: "Reverts"
  };
  return labels[type] || "Other";
}

function buildNotes(commits, fromRef, toRef) {
  const groups = new Map();
  const breaking = [];

  for (const subject of commits) {
    const parsed = parseConventional(subject);
    if (!parsed) {
      if (!groups.has("Other")) {
        groups.set("Other", []);
      }
      groups.get("Other").push(subject);
      continue;
    }
    const heading = toHeading(parsed.type);
    if (!groups.has(heading)) {
      groups.set(heading, []);
    }
    const scope = parsed.scope ? `**${parsed.scope}**: ` : "";
    groups.get(heading).push(`${scope}${parsed.description}`);
    if (parsed.breaking) {
      breaking.push(`${scope}${parsed.description}`);
    }
  }

  const lines = [];
  lines.push(`# Release Notes (${fromRef}..${toRef})`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  if (commits.length === 0) {
    lines.push("No commits found in range.");
    return lines.join("\n");
  }

  if (breaking.length > 0) {
    lines.push("## Breaking changes");
    for (const item of breaking) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  for (const [heading, items] of groups.entries()) {
    lines.push(`## ${heading}`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function main() {
  const from = getArg("--from") || latestTag();
  const to = getArg("--to") || "HEAD";
  const version = getArg("--version");
  const write = hasFlag("--write");
  const outFileArg = getArg("--out");
  const range = from ? `${from}..${to}` : to;
  const commits = collectCommits(range);
  const notes = buildNotes(commits, from || "start", to);

  if (!write) {
    process.stdout.write(`${notes}\n`);
    return;
  }

  const outFile =
    outFileArg ||
    (version
      ? path.join(process.cwd(), "docs", "releases", `${version}.md`)
      : path.join(process.cwd(), "docs", "releases", "unreleased.md"));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${notes}\n`, "utf-8");
  process.stdout.write(`Release notes written to ${outFile}\n`);
}

main();
