#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }
  return process.argv[index + 1] || "";
}

function normalizeVersion(raw) {
  const value = (raw || "").trim();
  if (!value) {
    throw new Error("Missing required --version (example: v0.1.20)");
  }
  const clean = value.startsWith("v") ? value.slice(1) : value;
  if (!/^\d+\.\d+\.\d+$/.test(clean)) {
    throw new Error(`Invalid version: ${value}`);
  }
  return clean;
}

function splitSections(content) {
  const lines = content.split(/\r?\n/);
  const unreleasedIndex = lines.findIndex((line) => line.trim() === "## Unreleased");
  if (unreleasedIndex === -1) {
    throw new Error("Changelog must include '## Unreleased' section.");
  }
  let nextHeader = lines.length;
  for (let i = unreleasedIndex + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      nextHeader = i;
      break;
    }
  }
  return { lines, unreleasedIndex, nextHeader };
}

function parseUnreleasedBullets(lines, start, end) {
  return lines
    .slice(start, end)
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .filter((line) => line.toLowerCase() !== "- none.");
}

function main() {
  const version = normalizeVersion(argValue("--version"));
  const changelogPath = argValue("--changelog") || path.join(process.cwd(), "docs", "CHANGELOG.md");
  const notesPath =
    argValue("--notes") || path.join(process.cwd(), "docs", "releases", `v${version}.md`);

  if (!fs.existsSync(changelogPath)) {
    throw new Error(`Changelog not found: ${changelogPath}`);
  }

  const raw = fs.readFileSync(changelogPath, "utf-8");
  const { lines, unreleasedIndex, nextHeader } = splitSections(raw);

  const existingVersion = lines.some((line) => line.trim() === `## ${version}`);
  if (existingVersion) {
    throw new Error(`Version already exists in changelog: ${version}`);
  }

  const unreleasedBullets = parseUnreleasedBullets(lines, unreleasedIndex + 1, nextHeader);
  const releaseBullets =
    unreleasedBullets.length > 0 ? unreleasedBullets : ["- No notable changes captured in Unreleased."];

  const notesBullet = fs.existsSync(notesPath)
    ? `- Release notes: \`${path.relative(process.cwd(), notesPath).replace(/\\/g, "/")}\``
    : "- Release notes: _pending_";
  const metricsPath = path.join(path.dirname(notesPath), `v${version}-metrics.md`);
  const metricsBullet = fs.existsSync(metricsPath)
    ? `- Release metrics: \`${path.relative(process.cwd(), metricsPath).replace(/\\/g, "/")}\``
    : "- Release metrics: _pending_";

  const head = lines.slice(0, unreleasedIndex + 1);
  const tail = lines.slice(nextHeader);

  const out = [];
  out.push(...head);
  out.push("- None.");
  out.push("");
  out.push(`## ${version}`);
  out.push(notesBullet);
  out.push(metricsBullet);
  releaseBullets.forEach((line) => out.push(line));
  out.push("");
  out.push(...tail);

  const normalized = `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  fs.writeFileSync(changelogPath, normalized, "utf-8");
  process.stdout.write(`Updated changelog: ${changelogPath}\n`);
}

main();
