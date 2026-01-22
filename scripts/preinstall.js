const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function getNpmPrefix() {
  try {
    return execSync("npm config get prefix", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function warn(message) {
  process.stderr.write(`\n[sdd-cli] ${message}\n`);
}

if (process.platform === "win32") {
  const prefix = getNpmPrefix();
  if (prefix) {
    const candidates = [
      path.join(prefix, "sdd"),
      path.join(prefix, "sdd.cmd"),
      path.join(prefix, "sdd.ps1")
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    if (existing) {
      warn(`Detected existing shim at ${existing}.`);
      warn("If install fails with EEXIST, remove the file and retry:");
      warn(`  Remove-Item -Force "${existing}"`);
    }
  }
  warn("If you see EPERM errors, re-run PowerShell as Administrator.");
}
