#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const outputRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const metricsPath = path.join(outputRoot, "metrics", "local-metrics.json");

if (!fs.existsSync(metricsPath)) {
  console.log(`No local metrics snapshot found at ${metricsPath}`);
  process.exit(0);
}

const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
const lines = [];
lines.push("# Local Metrics Summary");
lines.push("");
lines.push(`- First seen: ${metrics.firstSeenAt || "N/A"}`);
lines.push(`- Last seen: ${metrics.lastSeenAt || "N/A"}`);
lines.push(`- Activation started: ${metrics.activation?.started || 0}`);
lines.push(`- Activation completed: ${metrics.activation?.completed || 0}`);
lines.push("");
lines.push("## Commands");
const commands = Object.entries(metrics.commandCounts || {}).sort((a, b) => b[1] - a[1]);
if (commands.length === 0) {
  lines.push("- None");
} else {
  commands.forEach(([command, count]) => lines.push(`- ${command}: ${count}`));
}

console.log(lines.join("\n"));
