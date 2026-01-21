import { classifyIntent, FLOW_PROMPT_PACKS } from "../router/intent";
import { ensureWorkspace, getWorkspaceInfo, listProjects } from "../workspace/index";
import { ask, confirm } from "../ui/prompt";
import { getPromptPackById, loadPromptPacks } from "../router/prompt-packs";
import { mapAnswersToRequirement } from "../router/prompt-map";
import { runReqCreate } from "./req-create";
import { getFlags, setFlags } from "../context/flags";

export async function runHello(input: string, runQuestions?: boolean): Promise<void> {
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);
  const projects = listProjects(workspace);

  console.log("Hello from sdd-tool.");
  console.log(`Workspace: ${workspace.root}`);

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
  console.log("Next: run `sdd-tool route <your input>` to view details.");

  if (runQuestions) {
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
  }
}
