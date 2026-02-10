import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export type RuntimeVisualProbeResult = {
  ok: boolean;
  attempted: boolean;
  captured: boolean;
  command: string;
  screenshotPath: string;
  screenshotBytes: number;
  blankLikely: boolean;
  summary: string;
};

function run(command: string, args: string[]): { ok: boolean; output: string } {
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const result = useShell
    ? spawnSync([command, ...args].join(" "), { encoding: "utf-8", shell: true })
    : spawnSync(command, args, { encoding: "utf-8", shell: false });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, output };
}

function commandExists(command: string): boolean {
  const probe = process.platform === "win32" ? run("where", [command]) : run("which", [command]);
  return probe.ok;
}

function sleepMs(ms: number): void {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    // busy-wait intentionally short and deterministic for synchronous lifecycle flow
  }
}

function captureWindows(outFile: string): RuntimeVisualProbeResult {
  const ps = process.env.ComSpec ? "powershell" : "powershell";
  const escaped = outFile.replace(/'/g, "''");
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "Add-Type -AssemblyName System.Drawing;",
    "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;",
    "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;",
    "$g=[System.Drawing.Graphics]::FromImage($bmp);",
    "$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size);",
    `$bmp.Save('${escaped}',[System.Drawing.Imaging.ImageFormat]::Png);`,
    "$g.Dispose();",
    "$bmp.Dispose();"
  ].join(" ");
  const result = run(ps, ["-NoProfile", "-Command", script]);
  const bytes = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  const blankLikely = bytes > 0 && bytes < 12000;
  return {
    ok: result.ok,
    attempted: true,
    captured: result.ok && bytes > 0,
    command: `${ps} -NoProfile -Command <capture-screen>`,
    screenshotPath: outFile,
    screenshotBytes: bytes,
    blankLikely,
    summary: result.ok
      ? `windows screenshot captured (${bytes} bytes${blankLikely ? ", blank-likely" : ""})`
      : `windows screenshot failed: ${result.output || "unknown error"}`
  };
}

function captureMac(outFile: string): RuntimeVisualProbeResult {
  const result = run("screencapture", ["-x", outFile]);
  const bytes = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  const blankLikely = bytes > 0 && bytes < 12000;
  return {
    ok: result.ok,
    attempted: true,
    captured: result.ok && bytes > 0,
    command: "screencapture -x <outFile>",
    screenshotPath: outFile,
    screenshotBytes: bytes,
    blankLikely,
    summary: result.ok
      ? `mac screenshot captured (${bytes} bytes${blankLikely ? ", blank-likely" : ""})`
      : `mac screenshot failed: ${result.output || "unknown error"}`
  };
}

function captureLinux(outFile: string): RuntimeVisualProbeResult {
  const candidates: Array<{ command: string; args: string[] }> = [];
  if (commandExists("gnome-screenshot")) {
    candidates.push({ command: "gnome-screenshot", args: ["-f", outFile] });
  }
  if (commandExists("import")) {
    candidates.push({ command: "import", args: ["-window", "root", outFile] });
  }
  if (commandExists("scrot")) {
    candidates.push({ command: "scrot", args: [outFile] });
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      attempted: false,
      captured: false,
      command: "linux screenshot command not available",
      screenshotPath: outFile,
      screenshotBytes: 0,
      blankLikely: false,
      summary: "linux screenshot skipped: no supported command (gnome-screenshot/import/scrot) found"
    };
  }
  const chosen = candidates[0];
  const result = run(chosen.command, chosen.args);
  const bytes = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  const blankLikely = bytes > 0 && bytes < 12000;
  return {
    ok: result.ok,
    attempted: true,
    captured: result.ok && bytes > 0,
    command: `${chosen.command} ${chosen.args.join(" ")}`,
    screenshotPath: outFile,
    screenshotBytes: bytes,
    blankLikely,
    summary: result.ok
      ? `linux screenshot captured (${bytes} bytes${blankLikely ? ", blank-likely" : ""})`
      : `linux screenshot failed: ${result.output || "unknown error"}`
  };
}

export function runRuntimeVisualProbe(projectRoot: string, appDir: string): RuntimeVisualProbeResult {
  const enabled = process.env.SDD_VISUAL_PROBE !== "0";
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const shotsDir = path.join(deployDir, "visual");
  fs.mkdirSync(shotsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(shotsDir, `runtime-${stamp}.png`);
  if (!enabled) {
    return {
      ok: true,
      attempted: false,
      captured: false,
      command: "disabled",
      screenshotPath: outFile,
      screenshotBytes: 0,
      blankLikely: false,
      summary: "visual probe disabled by SDD_VISUAL_PROBE=0"
    };
  }
  const waitMsRaw = Number.parseInt(process.env.SDD_VISUAL_PROBE_WAIT_MS ?? "", 10);
  const waitMs = Number.isFinite(waitMsRaw) && waitMsRaw >= 0 ? Math.min(waitMsRaw, 20000) : 5000;
  if (waitMs > 0) {
    sleepMs(waitMs);
  }

  let result: RuntimeVisualProbeResult;
  if (process.platform === "win32") {
    result = captureWindows(outFile);
  } else if (process.platform === "darwin") {
    result = captureMac(outFile);
  } else {
    result = captureLinux(outFile);
  }

  const reportFile = path.join(deployDir, "runtime-visual-probe.json");
  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        projectRoot,
        ...result
      },
      null,
      2
    ),
    "utf-8"
  );
  const reportMd = path.join(deployDir, "runtime-visual-probe.md");
  const lines = [
    "# Runtime Visual Probe",
    "",
    `- at: ${new Date().toISOString()}`,
    `- ok: ${result.ok}`,
    `- attempted: ${result.attempted}`,
    `- captured: ${result.captured}`,
    `- blankLikely: ${result.blankLikely}`,
    `- screenshotBytes: ${result.screenshotBytes}`,
    `- screenshotPath: ${path.relative(appDir, result.screenshotPath).replace(/\\/g, "/")}`,
    `- command: ${result.command}`,
    "",
    `summary: ${result.summary}`
  ];
  fs.writeFileSync(reportMd, `${lines.join("\n")}\n`, "utf-8");
  return result;
}

