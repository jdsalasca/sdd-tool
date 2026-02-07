import fs from "fs";
import path from "path";
import { getRepoRoot } from "../paths";
import { loadPromptPacks, PromptPack } from "../router/prompt-packs";
import { ensureWorkspace, getWorkspaceInfo, listProjects, ProjectSummary } from "../workspace/index";
import { printError } from "../errors";

function listDirectoryNames(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => path.parse(entry.name).name)
    .sort();
}

export function runList(): void {
  const root = getRepoRoot();
  const flows = listDirectoryNames(path.join(root, "flows"), ".md");
  const routerFlows = listDirectoryNames(path.join(root, "router"), ".flow.md");
  const templates = Array.from(
    new Set([
      ...listDirectoryNames(path.join(root, "templates"), ".md"),
      ...listDirectoryNames(path.join(root, "templates"), ".yml")
    ])
  ).sort();

  console.log("Flows:");
  if (flows.length === 0) {
    console.log("- none");
  } else {
    flows.forEach((flow) => console.log(`- ${flow}`));
  }

  console.log("Router flows:");
  if (routerFlows.length === 0) {
    console.log("- none");
  } else {
    routerFlows.forEach((flow) => console.log(`- ${flow}`));
  }

  console.log("Templates:");
  if (templates.length === 0) {
    console.log("- none");
  } else {
    templates.forEach((template) => console.log(`- ${template}`));
  }

  let packs: PromptPack[];
  try {
    packs = loadPromptPacks();
  } catch (error) {
    printError("SDD-1421", `Unable to load prompt packs: ${(error as Error).message}`);
    return;
  }
  console.log("Prompt packs:");
  if (packs.length === 0) {
    console.log("- none");
  } else {
    packs.forEach((pack) => console.log(`- ${pack.id}`));
  }

  let projects: ProjectSummary[];
  try {
    const workspace = getWorkspaceInfo();
    ensureWorkspace(workspace);
    projects = listProjects(workspace);
  } catch (error) {
    printError("SDD-1422", (error as Error).message);
    return;
  }
  console.log("Projects:");
  if (projects.length === 0) {
    console.log("- none");
  } else {
    projects.forEach((project) => console.log(`- ${project.name} (${project.status})`));
  }
}
