import fs from "fs";
import path from "path";
import { getFlags } from "../context/flags";
import { ensureWorkspace, getProjectInfo, getWorkspaceInfo, listProjects } from "../workspace/index";
import { printError } from "../errors";

type StatusName = "backlog" | "wip" | "in-progress" | "done" | "archived";
type DeliveryStage =
  | "discovery"
  | "functional_requirements"
  | "technical_backlog"
  | "implementation"
  | "quality_validation"
  | "role_review"
  | "release_candidate"
  | "final_release"
  | "runtime_start";

const REQUIREMENT_STATUSES: StatusName[] = ["backlog", "wip", "in-progress", "done", "archived"];
const STAGE_ORDER: DeliveryStage[] = [
  "discovery",
  "functional_requirements",
  "technical_backlog",
  "implementation",
  "quality_validation",
  "role_review",
  "release_candidate",
  "final_release",
  "runtime_start"
];

type StatusOptions = {
  all?: boolean;
  quality?: boolean;
  watchSeconds?: number;
};

type QualitySnapshot = {
  lifecycleFails: number;
  lifecycleStatus: "pass" | "fail" | "missing";
  digitalReviewStatus: "pass" | "fail" | "missing";
  stageStatus: string;
  campaignStatus: string;
  qualityGate: "green" | "red" | "unknown";
};

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

function scopePrefix(): string {
  const flags = getFlags();
  return flags.scope && flags.scope.trim().length > 0 ? `--scope "${flags.scope.trim()}" ` : "";
}

function recommendNext(projectName: string, counts: Record<StatusName, number>, ids: Record<StatusName, string[]>): string {
  const prefix = scopePrefix();
  const nextInProgress = latestId(ids["in-progress"]);
  if (nextInProgress) {
    return `sdd-cli ${prefix}--project "${projectName}" req finish  # then enter ${nextInProgress} when prompted`;
  }
  const nextWip = latestId(ids.wip);
  if (nextWip) {
    return `sdd-cli ${prefix}--project "${projectName}" req start  # then enter ${nextWip} when prompted`;
  }
  const nextBacklog = latestId(ids.backlog);
  if (nextBacklog) {
    return `sdd-cli ${prefix}--project "${projectName}" req plan  # then enter ${nextBacklog} when prompted`;
  }
  if (counts.done > 0 && counts.archived === 0) {
    return `sdd-cli ${prefix}--project "${projectName}" hello "start next requirement"`;
  }
  return `sdd-cli ${prefix}--project "${projectName}" hello "continue"`;
}

export function runStatus(showNext?: boolean): void {
  runStatusWithOptions(showNext, {});
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getLifecycleFails(projectRoot: string): { fails: number; status: "pass" | "fail" | "missing" } {
  const file = path.join(projectRoot, "generated-app", "deploy", "lifecycle-report.md");
  if (!fs.existsSync(file)) {
    return { fails: 0, status: "missing" };
  }
  const raw = fs.readFileSync(file, "utf-8");
  const fails = (raw.match(/^- FAIL:/gm) ?? []).length;
  return { fails, status: fails > 0 ? "fail" : "pass" };
}

function getDigitalReviewStatus(projectRoot: string): "pass" | "fail" | "missing" {
  const file = path.join(projectRoot, "generated-app", "deploy", "digital-review-report.json");
  const report = readJson<{ passed?: boolean }>(file);
  if (!report) {
    return "missing";
  }
  return report.passed === true ? "pass" : "fail";
}

function getStageStatus(projectRoot: string): string {
  const file = path.join(projectRoot, ".sdd-stage-state.json");
  const snapshot = readJson<{ stages?: Record<string, string> }>(file);
  if (!snapshot?.stages) {
    return "missing";
  }
  const failed = STAGE_ORDER.find((stage) => snapshot.stages?.[stage] === "failed");
  if (failed) {
    return `${failed}:failed`;
  }
  let highest = "discovery:pending";
  for (const stage of STAGE_ORDER) {
    const state = snapshot.stages[stage];
    if (state === "passed") {
      highest = `${stage}:passed`;
    }
  }
  return highest;
}

function getCampaignStatus(projectRoot: string): string {
  const file = path.join(projectRoot, "suite-campaign-state.json");
  const state = readJson<{ cycle?: number; targetStage?: string; targetPassed?: boolean }>(file);
  if (!state) {
    return "idle";
  }
  const target = state.targetStage ?? "unknown";
  const passed = state.targetPassed === true ? "passed" : "pending";
  return `cycle=${state.cycle ?? 0}; target=${target}; ${passed}`;
}

function getQualitySnapshot(projectRoot: string): QualitySnapshot {
  const lifecycle = getLifecycleFails(projectRoot);
  const digitalReviewStatus = getDigitalReviewStatus(projectRoot);
  const stageStatus = getStageStatus(projectRoot);
  const campaignStatus = getCampaignStatus(projectRoot);
  const qualityGate =
    lifecycle.status === "missing"
      ? "unknown"
      : lifecycle.status === "pass" && digitalReviewStatus !== "fail"
        ? "green"
        : "red";
  return {
    lifecycleFails: lifecycle.fails,
    lifecycleStatus: lifecycle.status,
    digitalReviewStatus,
    stageStatus,
    campaignStatus,
    qualityGate
  };
}

function printQuality(projectRoot: string): void {
  const q = getQualitySnapshot(projectRoot);
  console.log("Quality:");
  console.log(`- gate: ${q.qualityGate}`);
  console.log(`- lifecycle: ${q.lifecycleStatus} (fails=${q.lifecycleFails})`);
  console.log(`- digital-review: ${q.digitalReviewStatus}`);
  console.log(`- stage: ${q.stageStatus}`);
  console.log(`- campaign: ${q.campaignStatus}`);
}

function printAllProjectsQuality(): void {
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);
  const projects = listProjects(workspace);
  console.log(`Workspace: ${workspace.root}`);
  if (projects.length === 0) {
    console.log("No projects found.");
    return;
  }
  console.log(`Projects overview: ${projects.length}`);
  for (const entry of projects) {
    const info = getProjectInfo(workspace, entry.name);
    if (!fs.existsSync(info.root)) {
      console.log(`- ${entry.name} | status=${entry.status} | quality=unknown | reason=project-root-unavailable`);
      continue;
    }
    const q = getQualitySnapshot(info.root);
    console.log(
      `- ${entry.name} | status=${entry.status} | quality=${q.qualityGate} | lifecycle=${q.lifecycleStatus}/${q.lifecycleFails} | stage=${q.stageStatus}`
    );
  }
}

function parseWatchSeconds(raw: number | undefined): number {
  if (!Number.isFinite(raw)) {
    return 0;
  }
  const value = Math.trunc(raw as number);
  return Math.max(0, Math.min(3600, value));
}

function sleep(seconds: number): void {
  const ms = seconds * 1000;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runStatusOnce(showNext: boolean | undefined, options: StatusOptions): void {
  if (options.all) {
    printAllProjectsQuality();
    return;
  }

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
    printError("SDD-1401", (error as Error).message);
    return;
  }
  if (!fs.existsSync(project.root)) {
    printError("SDD-1402", `Selected project not found in workspace: ${project.name}`);
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

  if (flags.scope && flags.scope.trim().length > 0) {
    console.log(`Scope: ${flags.scope.trim()}`);
  }
  console.log(`Project: ${project.name}`);
  REQUIREMENT_STATUSES.forEach((status) => {
    console.log(`- ${status}: ${counts[status]}`);
  });
  if (options.quality) {
    printQuality(project.root);
  }

  if (showNext) {
    const recommendation = recommendNext(project.name, counts, ids);
    console.log(`Next command: ${recommendation}`);
  }
}

export function runStatusWithOptions(showNext: boolean | undefined, options: StatusOptions): void {
  const watchSeconds = parseWatchSeconds(options.watchSeconds);
  if (watchSeconds <= 0) {
    runStatusOnce(showNext, options);
    return;
  }
  while (true) {
    console.clear();
    console.log(`Status watch tick: ${new Date().toISOString()}`);
    runStatusOnce(showNext, options);
    sleep(watchSeconds);
  }
}
