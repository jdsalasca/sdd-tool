const fs = require("node:fs");
const path = require("node:path");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
}

function extractGlobalFlags(cliSource) {
  const beforeHook = cliSource.split('program.hook("preAction"')[0] || cliSource;
  const matches = [...beforeHook.matchAll(/\.option\("([^"]+)"/g)];
  return matches
    .map((m) => m[1].trim().split(" ")[0])
    .filter((flag) => flag.startsWith("--"));
}

function missingFlags(flags, docText) {
  return flags.filter((flag) => !docText.includes(flag));
}

function main() {
  const cliSource = read("src/cli.ts");
  const commandsDoc = read("docs/COMMANDS.md");
  const readme = read("README.md");
  const flags = extractGlobalFlags(cliSource);

  const missingInCommands = missingFlags(flags, commandsDoc);
  const missingInReadme = missingFlags(flags, readme);

  if (missingInCommands.length === 0 && missingInReadme.length === 0) {
    console.log("Docs consistency OK: all global CLI flags are documented.");
    return;
  }

  if (missingInCommands.length > 0) {
    console.error(`Missing in docs/COMMANDS.md: ${missingInCommands.join(", ")}`);
  }
  if (missingInReadme.length > 0) {
    console.error(`Missing in README.md: ${missingInReadme.join(", ")}`);
  }
  process.exit(1);
}

main();
