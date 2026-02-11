import {
  ChildProcess,
  SpawnOptions,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
  spawn,
  spawnSync
} from "child_process";

type RunSyncArgs = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  timeout?: number;
  encoding?: BufferEncoding;
};

type SpawnCommandArgs = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  detached?: boolean;
  stdio?: SpawnOptions["stdio"];
};

function shouldUseWindowsShell(command: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }
  const normalized = command.toLowerCase();
  return normalized.endsWith(".cmd") || normalized.endsWith(".bat");
}

export function runCommandSync(command: string, args: string[], options: RunSyncArgs = {}): SpawnSyncReturns<string> {
  const shell = typeof options.shell === "boolean" ? options.shell : shouldUseWindowsShell(command);
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    cwd: options.cwd,
    env: options.env,
    shell,
    timeout: options.timeout,
    encoding: options.encoding ?? "utf-8",
    windowsHide: process.platform === "win32"
  };
  return spawnSync(command, args, spawnOptions);
}

export function runCommandLineSync(
  commandLine: string,
  options: Omit<RunSyncArgs, "shell"> = {}
): SpawnSyncReturns<string> {
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    cwd: options.cwd,
    env: options.env,
    shell: true,
    timeout: options.timeout,
    encoding: options.encoding ?? "utf-8",
    windowsHide: process.platform === "win32"
  };
  return spawnSync(commandLine, spawnOptions);
}

export function spawnCommand(command: string, args: string[], options: SpawnCommandArgs = {}): ChildProcess {
  const shell = typeof options.shell === "boolean" ? options.shell : shouldUseWindowsShell(command);
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell,
    detached: options.detached,
    stdio: options.stdio,
    windowsHide: process.platform === "win32"
  });
}
