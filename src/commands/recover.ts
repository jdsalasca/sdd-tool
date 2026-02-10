import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getFlags } from "../context/flags";
import { ensureWorkspace, getProjectInfo, getWorkspaceInfo } from "../workspace";
import { printError } from "../errors";
import { getRepoRoot } from "../paths";
import { runSuite } from "./suite";

type RecoverOptions = {
  foreground?: boolean;
  campaignHours?: string;
  campaignMaxCycles?: string;
  campaignSleepSeconds?: string;
  campaignTargetStage?: string;
  campaignAutonomous?: boolean;
};

function isPidRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function appendRecoveryEvent(projectRoot: string, event: string, details: Record<string, unknown>): void {
  try {
    const lifeRoot = path.join(projectRoot, "life");
    fs.mkdirSync(lifeRoot, { recursive: true });
    const file = path.join(lifeRoot, "recovery-events.jsonl");
    const payload = {
      at: new Date().toISOString(),
      event,
      ...details
    };
    fs.appendFileSync(file, `${JSON.stringify(payload)}\n`, "utf-8");
  } catch {
    // best effort
  }
}

function loadRecoveryHint(projectRoot: string): { fromStep: string; hint: string } {
  const runStatus = readJson<{
    recovery?: {
      fromStep?: string;
      hint?: string;
    };
  }>(path.join(projectRoot, "sdd-run-status.json"));
  const campaign = readJson<{
    nextFromStep?: string;
  }>(path.join(projectRoot, "suite-campaign-state.json"));
  const fromStep = String(runStatus?.recovery?.fromStep || campaign?.nextFromStep || "finish").trim() || "finish";
  const hint =
    String(runStatus?.recovery?.hint || "").trim() ||
    "continue delivery to final release and runtime start with production quality";
  return { fromStep, hint };
}

function lockPid(workspaceRoot: string, projectName?: string): number {
  const project = String(projectName || "").trim();
  if (project) {
    const projectLock = readJson<{ pid?: number }>(path.join(workspaceRoot, project, ".sdd-suite-lock.json"));
    return Number(projectLock?.pid || 0);
  }
  const workspaceLock = readJson<{ pid?: number }>(path.join(workspaceRoot, ".sdd-suite-lock.json"));
  return Number(workspaceLock?.pid || 0);
}

function buildRecoverCommand(
  project: string,
  provider: string,
  model: string,
  fromStep: string,
  hint: string,
  options?: RecoverOptions
): string[] {
  const args = ["dist/cli.js", "--non-interactive", "--provider", provider, "--project", project, "--iterations", "10"];
  if (model) {
    args.push("--model", model);
  }
  args.push("suite", "--campaign-autonomous");
  if (options?.campaignHours) args.push("--campaign-hours", options.campaignHours);
  if (options?.campaignMaxCycles) args.push("--campaign-max-cycles", options.campaignMaxCycles);
  if (options?.campaignSleepSeconds) args.push("--campaign-sleep-seconds", options.campaignSleepSeconds);
  if (options?.campaignTargetStage) args.push("--campaign-target-stage", options.campaignTargetStage);
  args.push("--from-step", fromStep, hint);
  return args;
}

export async function runRecover(input: string, options?: RecoverOptions): Promise<void> {
  const flags = getFlags();
  const workspace = getWorkspaceInfo();
  ensureWorkspace(workspace);
  const projectName = String(flags.project || "").trim();
  if (!projectName) {
    printError("SDD-1511", "Recover requires --project <name>.");
    return;
  }
  const project = getProjectInfo(workspace, projectName);
  if (!fs.existsSync(project.root)) {
    printError("SDD-1512", `Project not found in workspace: ${projectName}`);
    return;
  }

  const existingPid = lockPid(workspace.root, project.name);
  if (existingPid > 0 && isPidRunning(existingPid)) {
    console.log(`Recovery skipped: suite already running (pid=${existingPid}).`);
    appendRecoveryEvent(project.root, "recover.skipped.already_running", { pid: existingPid });
    return;
  }

  const provider = String(flags.provider || "gemini").trim() || "gemini";
  const model = String(flags.model || "").trim();
  const goal = String(input || "").trim();
  const hintMeta = loadRecoveryHint(project.root);
  const prompt = goal || hintMeta.hint;
  const fromStep = hintMeta.fromStep;
  const commandArgs = buildRecoverCommand(project.name, provider, model, fromStep, prompt, options);
  appendRecoveryEvent(project.root, "recover.requested", {
    provider,
    model,
    fromStep,
    mode: options?.foreground ? "foreground" : "background",
    command: [process.execPath, ...commandArgs].join(" ")
  });

  if (options?.foreground) {
    await runSuite(prompt, {
      campaignHours: options?.campaignHours,
      campaignMaxCycles: options?.campaignMaxCycles,
      campaignSleepSeconds: options?.campaignSleepSeconds,
      campaignTargetStage: options?.campaignTargetStage,
      campaignAutonomous: options?.campaignAutonomous ?? true
    });
    appendRecoveryEvent(project.root, "recover.foreground.completed", { ok: true });
    return;
  }

  const outDir = path.join(workspace.root, "_suite-logs");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `${project.name}.recover.${stamp}.out.log`);
  const errFile = path.join(outDir, `${project.name}.recover.${stamp}.err.log`);
  const outFd = fs.openSync(outFile, "a");
  const errFd = fs.openSync(errFile, "a");
  const child = spawn(process.execPath, commandArgs, {
    cwd: getRepoRoot(),
    detached: true,
    stdio: ["ignore", outFd, errFd]
  });
  child.unref();
  try {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  } catch {
    // best effort
  }
  appendRecoveryEvent(project.root, "recover.started", {
    pid: child.pid,
    outFile,
    errFile,
    provider,
    model,
    fromStep
  });
  console.log(`Recovery started in background (pid=${child.pid}).`);
}
