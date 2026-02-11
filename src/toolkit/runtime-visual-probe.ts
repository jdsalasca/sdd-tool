import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import { createHash } from "crypto";
import { runCommandLineSync, runCommandSync } from "../platform/process-exec";

type PixelStats = {
  width: number;
  height: number;
  sampledPixels: number;
  meanLuma: number;
  stddevLuma: number;
  dominantBucketRatio: number;
  entropy: number;
};

export type RuntimeVisualProbeResult = {
  ok: boolean;
  attempted: boolean;
  captured: boolean;
  command: string;
  screenshotPath: string;
  screenshotBytes: number;
  blankLikely: boolean;
  staticLikely: boolean;
  summary: string;
  stats?: PixelStats;
};

function run(command: string, args: string[]): { ok: boolean; output: string } {
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const result = useShell
    ? runCommandLineSync([command, ...args].join(" "), { encoding: "utf-8" })
    : runCommandSync(command, args, { encoding: "utf-8", shell: false });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, output };
}

function commandExists(command: string): boolean {
  const probe = process.platform === "win32" ? run("where", [command]) : run("which", [command]);
  return probe.ok;
}

function sleepMs(ms: number): void {
  const waitMs = Math.max(0, Math.min(ms, 20000));
  if (waitMs === 0) return;
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0, waitMs);
}

function parsePngStats(file: string): PixelStats | null {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file);
    const png = PNG.sync.read(raw);
    const { width, height, data } = png;
    if (!width || !height || data.length < 4) return null;

    const stepX = Math.max(1, Math.floor(width / 220));
    const stepY = Math.max(1, Math.floor(height / 160));
    const buckets = new Array<number>(16).fill(0);
    let sampled = 0;
    let lumaSum = 0;
    let lumaSqSum = 0;

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const idx = (width * y + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const alpha = a / 255;
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) * alpha;
        const bucket = Math.max(0, Math.min(15, Math.floor((luma / 256) * 16)));
        buckets[bucket] += 1;
        sampled += 1;
        lumaSum += luma;
        lumaSqSum += luma * luma;
      }
    }

    if (sampled === 0) return null;
    const meanLuma = lumaSum / sampled;
    const variance = Math.max(0, lumaSqSum / sampled - meanLuma * meanLuma);
    const stddevLuma = Math.sqrt(variance);
    const maxBucket = Math.max(...buckets);
    const dominantBucketRatio = maxBucket / sampled;
    let entropy = 0;
    for (const count of buckets) {
      if (count <= 0) continue;
      const p = count / sampled;
      entropy += -p * Math.log2(p);
    }
    return {
      width,
      height,
      sampledPixels: sampled,
      meanLuma: Number(meanLuma.toFixed(2)),
      stddevLuma: Number(stddevLuma.toFixed(2)),
      dominantBucketRatio: Number(dominantBucketRatio.toFixed(4)),
      entropy: Number(entropy.toFixed(4))
    };
  } catch {
    return null;
  }
}

function hashFileSha1(file: string): string {
  if (!fs.existsSync(file)) return "";
  try {
    const raw = fs.readFileSync(file);
    return createHash("sha1").update(raw).digest("hex");
  } catch {
    return "";
  }
}

function captureWindows(outFile: string): RuntimeVisualProbeResult {
  const ps = "powershell";
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
  return {
    ok: result.ok,
    attempted: true,
    captured: result.ok && bytes > 0,
    command: `${ps} -NoProfile -Command <capture-screen>`,
    screenshotPath: outFile,
    screenshotBytes: bytes,
    blankLikely: false,
    staticLikely: false,
    summary: result.ok ? `windows screenshot captured (${bytes} bytes)` : `windows screenshot failed: ${result.output || "unknown error"}`
  };
}

function captureMac(outFile: string): RuntimeVisualProbeResult {
  const result = run("screencapture", ["-x", outFile]);
  const bytes = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  return {
    ok: result.ok,
    attempted: true,
    captured: result.ok && bytes > 0,
    command: "screencapture -x <outFile>",
    screenshotPath: outFile,
    screenshotBytes: bytes,
    blankLikely: false,
    staticLikely: false,
    summary: result.ok ? `mac screenshot captured (${bytes} bytes)` : `mac screenshot failed: ${result.output || "unknown error"}`
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
      staticLikely: false,
      summary: "linux screenshot skipped: no supported command (gnome-screenshot/import/scrot) found"
    };
  }
  const chosen = candidates[0];
  const result = run(chosen.command, chosen.args);
  const bytes = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  return {
    ok: result.ok,
    attempted: true,
    captured: result.ok && bytes > 0,
    command: `${chosen.command} ${chosen.args.join(" ")}`,
    screenshotPath: outFile,
    screenshotBytes: bytes,
    blankLikely: false,
    staticLikely: false,
    summary: result.ok ? `linux screenshot captured (${bytes} bytes)` : `linux screenshot failed: ${result.output || "unknown error"}`
  };
}

function applyHeuristics(base: RuntimeVisualProbeResult, firstStats: PixelStats | null, secondPath: string): RuntimeVisualProbeResult {
  const secondHash = hashFileSha1(secondPath);
  const firstHash = hashFileSha1(base.screenshotPath);
  const staticLikely = Boolean(firstHash) && firstHash === secondHash;
  const stats = firstStats ?? undefined;
  const lowVariance = stats ? stats.stddevLuma < 4 : false;
  const veryBrightOrDark = stats ? stats.meanLuma < 8 || stats.meanLuma > 247 : false;
  const dominantColor = stats ? stats.dominantBucketRatio >= 0.965 : false;
  const lowEntropy = stats ? stats.entropy < 0.8 : false;
  const tiny = base.screenshotBytes > 0 && base.screenshotBytes < 12000;
  const blankLikely = Boolean(
    tiny ||
      (lowVariance && veryBrightOrDark) ||
      (dominantColor && lowVariance) ||
      (dominantColor && lowEntropy) ||
      (staticLikely && lowVariance && dominantColor)
  );
  return {
    ...base,
    blankLikely,
    staticLikely,
    stats,
    summary: `${base.summary}${blankLikely ? " | visual-analysis: blank-likely" : " | visual-analysis: non-blank"}${
      staticLikely ? " | static-frame-likely" : ""
    }`
  };
}

/**
 * Captures runtime visual evidence and applies blank/static heuristics.
 * The output is persisted into deploy artifacts so orchestration and monitors can consume it.
 */
export function runRuntimeVisualProbe(projectRoot: string, appDir: string): RuntimeVisualProbeResult {
  const enabled = process.env.SDD_VISUAL_PROBE !== "0";
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const shotsDir = path.join(deployDir, "visual");
  fs.mkdirSync(shotsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const firstFile = path.join(shotsDir, `runtime-${stamp}-1.png`);
  const secondFile = path.join(shotsDir, `runtime-${stamp}-2.png`);
  if (!enabled) {
    return {
      ok: true,
      attempted: false,
      captured: false,
      command: "disabled",
      screenshotPath: firstFile,
      screenshotBytes: 0,
      blankLikely: false,
      staticLikely: false,
      summary: "visual probe disabled by SDD_VISUAL_PROBE=0"
    };
  }
  const waitMsRaw = Number.parseInt(process.env.SDD_VISUAL_PROBE_WAIT_MS ?? "", 10);
  const waitMs = Number.isFinite(waitMsRaw) && waitMsRaw >= 0 ? Math.min(waitMsRaw, 20000) : 5000;
  if (waitMs > 0) {
    sleepMs(waitMs);
  }

  let first: RuntimeVisualProbeResult;
  if (process.platform === "win32") {
    first = captureWindows(firstFile);
    sleepMs(900);
    captureWindows(secondFile);
  } else if (process.platform === "darwin") {
    first = captureMac(firstFile);
    sleepMs(900);
    captureMac(secondFile);
  } else {
    first = captureLinux(firstFile);
    sleepMs(900);
    captureLinux(secondFile);
  }
  const stats = parsePngStats(firstFile);
  const result = applyHeuristics(first, stats, secondFile);

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
    `- staticLikely: ${result.staticLikely}`,
    `- screenshotBytes: ${result.screenshotBytes}`,
    `- screenshotPath: ${path.relative(appDir, result.screenshotPath).replace(/\\/g, "/")}`,
    `- command: ${result.command}`,
    "",
    `summary: ${result.summary}`
  ];
  if (result.stats) {
    lines.push("");
    lines.push("## Pixel Stats");
    lines.push(`- width: ${result.stats.width}`);
    lines.push(`- height: ${result.stats.height}`);
    lines.push(`- sampledPixels: ${result.stats.sampledPixels}`);
    lines.push(`- meanLuma: ${result.stats.meanLuma}`);
    lines.push(`- stddevLuma: ${result.stats.stddevLuma}`);
    lines.push(`- dominantBucketRatio: ${result.stats.dominantBucketRatio}`);
    lines.push(`- entropy: ${result.stats.entropy}`);
  }
  fs.writeFileSync(reportMd, `${lines.join("\n")}\n`, "utf-8");
  return result;
}
