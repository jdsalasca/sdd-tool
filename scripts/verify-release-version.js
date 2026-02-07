#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) {
    return "";
  }
  return process.argv[idx + 1] || "";
}

function normalizeTag(raw) {
  const value = (raw || "").trim();
  if (!value) {
    return "";
  }
  return value.startsWith("v") ? value.slice(1) : value;
}

function main() {
  const explicitTag = getArg("--tag");
  const envTag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || "";
  const tag = normalizeTag(explicitTag || envTag);
  if (!tag) {
    console.error("[SDD-3001] Missing release tag. Pass --tag vX.Y.Z or set RELEASE_TAG.");
    process.exit(1);
  }

  const pkgPath = path.join(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const version = String(pkg.version || "").trim();
  if (!version) {
    console.error("[SDD-3002] package.json version is missing.");
    process.exit(1);
  }
  if (version !== tag) {
    console.error(`[SDD-3003] Version mismatch: tag=${tag}, package.json=${version}`);
    process.exit(1);
  }
  console.log(`Release version verified: v${version}`);
}

main();
