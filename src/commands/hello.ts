import { classifyIntent } from "../router/intent";
import { getWorkspaceInfo, listProjects } from "../workspace/index";

export function runHello(input: string): void {
  const workspace = getWorkspaceInfo();
  const projects = listProjects(workspace);

  console.log("Hello from sdd-tool.");
  console.log(`Workspace: ${workspace.root}`);

  if (projects.length > 0) {
    console.log("Active projects:");
    projects.forEach((project) => {
      console.log(`- ${project.name} (${project.status})`);
    });
  } else {
    console.log("No active projects found.");
  }

  if (input) {
    const intent = classifyIntent(input);
    console.log(`Detected intent: ${intent.intent} -> ${intent.flow}`);
    console.log("Next: run `sdd-tool route <your input>` to view details.");
  } else {
    console.log("Tip: add a description after `hello` to classify intent.");
  }
}
