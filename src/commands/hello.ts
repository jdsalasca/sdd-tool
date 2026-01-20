import { classifyIntent } from "../router/intent";
import { ensureWorkspace, getWorkspaceInfo, listProjects } from "../workspace/index";
import { ask } from "../ui/prompt";

export async function runHello(input: string): Promise<void> {
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);
  const projects = listProjects(workspace);

  console.log("Hello from sdd-tool.");
  console.log(`Workspace: ${workspace.root}`);

  if (projects.length > 0) {
    console.log("Active projects:");
    projects.forEach((project) => {
      console.log(`- ${project.name} (${project.status})`);
    });
    const choice = await ask("Start new or continue? (new/continue) ");
    console.log(`Selected: ${choice || "new"}`);
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
}
