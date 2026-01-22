import { classifyIntent, FLOW_PROMPT_PACKS } from "../router/intent";
import { ensureWorkspace, getWorkspaceInfo, listProjects } from "../workspace/index";
import { ask, confirm } from "../ui/prompt";
import { getPromptPackById, loadPromptPacks } from "../router/prompt-packs";
import { mapAnswersToRequirement } from "../router/prompt-map";
import { runReqCreate } from "./req-create";
import { getFlags, setFlags } from "../context/flags";
import { runRoute } from "./route";

export async function runHello(input: string, runQuestions?: boolean): Promise<void> {
  function loadWorkspace() {
    const workspace = getWorkspaceInfo();
    ensureWorkspace(workspace);
    const projects = listProjects(workspace);
    return { workspace, projects };
  }

  let { workspace, projects } = loadWorkspace();

  console.log("Hello from sdd-cli.");
  console.log(`Workspace: ${workspace.root}`);
  const useWorkspace = await confirm("Use this workspace path? (y/n) ");
  if (!useWorkspace) {
    const nextPath = await ask("Workspace path to use (blank to exit): ");
    if (!nextPath) {
      console.log("Run again from the desired folder or pass --output <path>.");
      return;
    }
    setFlags({ output: nextPath });
    const reloaded = loadWorkspace();
    workspace = reloaded.workspace;
    projects = reloaded.projects;
    console.log(`Workspace updated: ${workspace.root}`);
  }

  const flags = getFlags();
  if (projects.length > 0) {
    console.log("Active projects:");
    projects.forEach((project) => {
      console.log(`- ${project.name} (${project.status})`);
    });
    const choice = await ask("Start new or continue? (new/continue) ");
    const normalized = choice.trim().toLowerCase();
    if (normalized === "continue") {
      const selected = flags.project || (await ask("Project to continue: "));
      if (!selected) {
        console.log("No project selected. Continuing with new flow.");
      } else if (!projects.find((project) => project.name === selected)) {
        console.log(`Project not found: ${selected}. Continuing with new flow.`);
      } else {
        setFlags({ project: selected });
        console.log(`Continuing: ${selected}`);
      }
    } else {
      console.log(`Selected: ${choice || "new"}`);
    }
  } else {
    console.log("No active projects found.");
  }

  const text = input || (await ask("Describe what you want to do: "));
  if (!text) {
    console.log("No input provided. Try again with a short description.");
    return;
  }
  const intent = classifyIntent(text);
  console.log(`Detected intent: ${intent.intent} -> ${intent.flow}`);
  const showRoute = await confirm("View route details now? (y/n) ");
  if (showRoute) {
    runRoute(text);
  } else {
    console.log("Next: run `sdd-cli route <your input>` to view details.");
  }

  const shouldRunQuestions = runQuestions ?? (await confirm("Run prompt questions now? (y/n) "));
  if (shouldRunQuestions) {
    const packs = loadPromptPacks();
    const packIds = FLOW_PROMPT_PACKS[intent.flow] ?? [];
    const answers: Record<string, string> = {};
    for (const packId of packIds) {
      const pack = getPromptPackById(packs, packId);
      if (!pack) continue;
      console.log(`\n[${pack.id}]`);
      for (const question of pack.questions) {
        const response = await ask(`${question} `);
        answers[question] = response;
      }
    }
    console.log("\nCaptured answers:");
    Object.entries(answers).forEach(([question, response]) => {
      console.log(`- ${question} -> ${response}`);
    });

    if (runQuestions && Object.keys(answers).length > 0) {
      const mapped = mapAnswersToRequirement(answers);
      console.log("\nDraft requirement fields:");
      console.log(JSON.stringify(mapped, null, 2));
      const ok = await confirm("Generate requirement draft now? (y/n) ");
      if (ok) {
        await runReqCreate(mapped);
      }
    }
  } else {
    console.log("\nNext steps:");
    console.log("- Run `sdd-cli route \"<your input>\"` to review the flow.");
    console.log("- Run `sdd-cli req create` to draft a requirement.");
  }
}

