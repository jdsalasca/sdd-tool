import fs from "fs";
import path from "path";
import { getFlags } from "../context/flags";
import { ensureWorkspace, getProjectInfo, getWorkspaceInfo, listProjects } from "../workspace/index";

type StatusName = "backlog" | "wip" | "in-progress" | "done" | "archived";

const REQUIREMENT_STATUSES: StatusName[] = ["backlog", "wip", "in-progress", "done", "archived"];

function listRequirementIds(projectRoot: string, status: StatusName): string[] {
  const dir = path.join(projectRoot, "requirements", status);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function latestId(ids: string[]): string | null {
  if (ids.length === 0) {
    return null;
  }
  return ids[ids.length - 1];
}

function recommendNext(projectName: string, counts: Record<StatusName, number>, ids: Record<StatusName, string[]>): string {
  const nextInProgress = latestId(ids["in-progress"]);
  if (nextInProgress) {
    return `sdd-cli --project "${projectName}" req finish  # then enter ${nextInProgress} when prompted`;
  }
  const nextWip = latestId(ids.wip);
  if (nextWip) {
    return `sdd-cli --project "${projectName}" req start  # then enter ${nextWip} when prompted`;
  }
  const nextBacklog = latestId(ids.backlog);
  if (nextBacklog) {
    return `sdd-cli --project "${projectName}" req plan  # then enter ${nextBacklog} when prompted`;
  }
  if (counts.done > 0 && counts.archived === 0) {
    return `sdd-cli --project "${projectName}" hello "start next requirement"`;
  }
  return `sdd-cli --project "${projectName}" hello "continue"`;
}

export function runStatus(showNext?: boolean): void {
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);
  const projects = listProjects(workspace);
  const flags = getFlags();
  const selectedName = flags.project && flags.project.trim().length > 0 ? flags.project.trim() : projects[0]?.name;
  if (!selectedName) {
    console.log("No projects found.");
    if (showNext) {
      console.log('Next command: sdd-cli quickstart --example saas');
    }
    return;
  }
  let project;
  try {
    project = getProjectInfo(workspace, selectedName);
  } catch (error) {
    console.log((error as Error).message);
    return;
  }
  if (!fs.existsSync(project.root)) {
    console.log("No projects found.");
    if (showNext) {
      console.log('Next command: sdd-cli quickstart --example saas');
    }
    return;
  }

  const ids = {
    backlog: listRequirementIds(project.root, "backlog"),
    wip: listRequirementIds(project.root, "wip"),
    "in-progress": listRequirementIds(project.root, "in-progress"),
    done: listRequirementIds(project.root, "done"),
    archived: listRequirementIds(project.root, "archived")
  };
  const counts = {
    backlog: ids.backlog.length,
    wip: ids.wip.length,
    "in-progress": ids["in-progress"].length,
    done: ids.done.length,
    archived: ids.archived.length
  };

  console.log(`Project: ${project.name}`);
  REQUIREMENT_STATUSES.forEach((status) => {
    console.log(`- ${status}: ${counts[status]}`);
  });

  if (showNext) {
    const recommendation = recommendNext(project.name, counts, ids);
    console.log(`Next command: ${recommendation}`);
  }
}
