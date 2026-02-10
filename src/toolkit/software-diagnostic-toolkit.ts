import fs from "fs";
import path from "path";
import { runRuntimeVisualProbe, RuntimeVisualProbeResult } from "./runtime-visual-probe";

export enum ToolkitProbeStatus {
  Passed = "passed",
  Failed = "failed",
  Skipped = "skipped"
}

export type RuntimeHttpProbe = {
  status: ToolkitProbeStatus;
  testedUrls: string[];
  reachableUrl: string;
  httpStatus: number;
  summary: string;
};

export type RuntimeInteractionProbe = {
  status: ToolkitProbeStatus;
  url: string;
  clickableCount: number;
  clicksPerformed: number;
  consoleErrors: string[];
  pageErrors: string[];
  blankLikely: boolean;
  screenshotBefore: string;
  screenshotAfter: string;
  summary: string;
};

export type SoftwareDiagnosticReport = {
  at: string;
  goalText: string;
  visual: RuntimeVisualProbeResult;
  http: RuntimeHttpProbe;
  interaction: RuntimeInteractionProbe;
  blockingIssues: string[];
  summary: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `http://${value}`;
}

function candidateUrls(): string[] {
  const envRaw = process.env.SDD_RUNTIME_URLS ?? process.env.SDD_RUNTIME_URL ?? "";
  const envUrls = envRaw
    .split(/[,\s]+/)
    .map(normalizeUrl)
    .filter(Boolean);
  const defaults = [3000, 3001, 4173, 5173, 8080, 8081, 4200, 5000].map((port) => `http://127.0.0.1:${port}`);
  const merged = [...envUrls, ...defaults];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const url of merged) {
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(url);
  }
  return unique;
}

async function runHttpProbe(): Promise<RuntimeHttpProbe> {
  const tested: string[] = [];
  const urls = candidateUrls();
  const retriesRaw = Number.parseInt(process.env.SDD_RUNTIME_HTTP_RETRIES ?? "", 10);
  const retries = Number.isFinite(retriesRaw) && retriesRaw > 0 ? Math.min(10, retriesRaw) : 5;
  const delayRaw = Number.parseInt(process.env.SDD_RUNTIME_HTTP_DELAY_MS ?? "", 10);
  const delayMs = Number.isFinite(delayRaw) && delayRaw > 0 ? Math.min(5000, delayRaw) : 2500;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    for (const url of urls) {
      tested.push(url);
      const ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), 2200);
      try {
        const res = await fetch(url, { method: "GET", signal: ctl.signal });
        clearTimeout(timeout);
        if (res.status >= 200 && res.status < 500) {
          return {
            status: ToolkitProbeStatus.Passed,
            testedUrls: tested,
            reachableUrl: url,
            httpStatus: res.status,
            summary: `runtime reachable on ${url} (status ${res.status})`
          };
        }
      } catch {
        clearTimeout(timeout);
      }
    }
    if (attempt < retries) {
      await sleep(delayMs);
    }
  }
  return {
    status: ToolkitProbeStatus.Failed,
    testedUrls: tested,
    reachableUrl: "",
    httpStatus: 0,
    summary: `runtime http probe failed after ${retries} retries`
  };
}

async function runInteractionProbe(appDir: string, reachableUrl: string): Promise<RuntimeInteractionProbe> {
  const deployDir = path.join(appDir, "deploy");
  const shotsDir = path.join(deployDir, "visual");
  fs.mkdirSync(shotsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const before = path.join(shotsDir, `interaction-${stamp}-before.png`);
  const after = path.join(shotsDir, `interaction-${stamp}-after.png`);

  if (!reachableUrl) {
    return {
      status: ToolkitProbeStatus.Skipped,
      url: "",
      clickableCount: 0,
      clicksPerformed: 0,
      consoleErrors: [],
      pageErrors: [],
      blankLikely: false,
      screenshotBefore: before,
      screenshotAfter: after,
      summary: "interaction probe skipped: no reachable runtime URL"
    };
  }

  try {
    const dynamicImport = new Function("modulePath", "return import(modulePath);") as (modulePath: string) => Promise<any>;
    const playwrightMod = await dynamicImport("playwright");
    const browser = await playwrightMod.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg: any) => {
      if (msg?.type?.() === "error") {
        consoleErrors.push(String(msg.text?.() || "").slice(0, 220));
      }
    });
    page.on("pageerror", (error: any) => {
      pageErrors.push(String(error?.message || error || "").slice(0, 220));
    });
    await page.goto(reachableUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.screenshot({ path: before, fullPage: true });
    const clickableCount = await page.locator("button, [role='button'], a[href], input[type='submit']").count();
    const maxClicksRaw = Number.parseInt(process.env.SDD_RUNTIME_INTERACTION_CLICKS ?? "", 10);
    const maxClicks = Number.isFinite(maxClicksRaw) && maxClicksRaw > 0 ? Math.min(6, maxClicksRaw) : 3;
    let clicksPerformed = 0;
    const count = Math.min(clickableCount, maxClicks);
    for (let i = 0; i < count; i += 1) {
      const item = page.locator("button, [role='button'], a[href], input[type='submit']").nth(i);
      try {
        await item.click({ timeout: 1200 });
        clicksPerformed += 1;
        await page.waitForTimeout(250);
      } catch {
        // ignore click failure on hidden/covered elements
      }
    }
    await page.screenshot({ path: after, fullPage: true });
    const textLen = await page.evaluate(() => (document.body?.innerText || "").trim().length);
    const blankLikely = textLen < 25 && clickableCount === 0;
    await browser.close();
    return {
      status: ToolkitProbeStatus.Passed,
      url: reachableUrl,
      clickableCount,
      clicksPerformed,
      consoleErrors: consoleErrors.slice(0, 20),
      pageErrors: pageErrors.slice(0, 20),
      blankLikely,
      screenshotBefore: before,
      screenshotAfter: after,
      summary: `interaction probe done on ${reachableUrl}: clickable=${clickableCount}, clicks=${clicksPerformed}, consoleErrors=${consoleErrors.length}, pageErrors=${pageErrors.length}${blankLikely ? ", blank-likely" : ""}`
    };
  } catch (error) {
    return {
      status: ToolkitProbeStatus.Skipped,
      url: reachableUrl,
      clickableCount: 0,
      clicksPerformed: 0,
      consoleErrors: [],
      pageErrors: [],
      blankLikely: false,
      screenshotBefore: before,
      screenshotAfter: after,
      summary: `interaction probe skipped: playwright unavailable (${String(error).slice(0, 160)})`
    };
  }
}

function inferBlockingIssues(report: { visual: RuntimeVisualProbeResult; http: RuntimeHttpProbe; interaction: RuntimeInteractionProbe; goalText?: string }): string[] {
  const issues: string[] = [];
  const goal = (report.goalText || "").toLowerCase();
  const desktopGoal = /\bdesktop\b|\bwindows\b|\bmac\b|\belectron\b/.test(goal);
  if (report.http.status === ToolkitProbeStatus.Failed) {
    issues.push(report.http.summary);
  }
  if (report.visual.blankLikely || report.visual.staticLikely) {
    issues.push(`visual probe indicates blank/static runtime (${report.visual.summary})`);
  }
  if (report.interaction.status === ToolkitProbeStatus.Passed && report.interaction.blankLikely) {
    issues.push("interaction probe indicates likely blank UI (low text/no clickable controls)");
  }
  if (report.interaction.pageErrors.length > 0) {
    issues.push(`browser page errors detected (${report.interaction.pageErrors.length})`);
  }
  if (desktopGoal && !report.visual.captured) {
    issues.push("desktop goal requires successful runtime screenshot capture");
  }
  return issues;
}

function writeReport(appDir: string, report: SoftwareDiagnosticReport): void {
  const deployDir = path.join(appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const jsonFile = path.join(deployDir, "software-diagnostic-report.json");
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf-8");
  const mdFile = path.join(deployDir, "software-diagnostic-report.md");
  const lines = [
    "# Software Diagnostic Report",
    "",
    `- at: ${report.at}`,
    `- summary: ${report.summary}`,
    `- blockingIssues: ${report.blockingIssues.length}`,
    "",
    "## Runtime HTTP",
    `- status: ${report.http.status}`,
    `- reachableUrl: ${report.http.reachableUrl || "n/a"}`,
    `- httpStatus: ${report.http.httpStatus || 0}`,
    `- summary: ${report.http.summary}`,
    "",
    "## Visual Probe",
    `- blankLikely: ${report.visual.blankLikely}`,
    `- staticLikely: ${report.visual.staticLikely}`,
    `- summary: ${report.visual.summary}`,
    "",
    "## Interaction Probe",
    `- status: ${report.interaction.status}`,
    `- summary: ${report.interaction.summary}`,
    `- clickableCount: ${report.interaction.clickableCount}`,
    `- clicksPerformed: ${report.interaction.clicksPerformed}`,
    `- pageErrors: ${report.interaction.pageErrors.length}`,
    `- consoleErrors: ${report.interaction.consoleErrors.length}`,
    "",
    "## Blocking Issues",
    ...(report.blockingIssues.length > 0 ? report.blockingIssues.map((line) => `- ${line}`) : ["- none"])
  ];
  fs.writeFileSync(mdFile, `${lines.join("\n")}\n`, "utf-8");
}

export async function runSoftwareDiagnosticToolkit(params: {
  projectRoot: string;
  appDir: string;
  goalText?: string;
}): Promise<SoftwareDiagnosticReport> {
  const visual = runRuntimeVisualProbe(params.projectRoot, params.appDir);
  const http = await runHttpProbe();
  const interaction = await runInteractionProbe(params.appDir, http.reachableUrl);
  const blockingIssues = inferBlockingIssues({
    visual,
    http,
    interaction,
    goalText: params.goalText
  });
  const summary =
    blockingIssues.length > 0
      ? `software diagnostics found ${blockingIssues.length} blocking issue(s)`
      : "software diagnostics passed";
  const report: SoftwareDiagnosticReport = {
    at: new Date().toISOString(),
    goalText: params.goalText ?? "",
    visual,
    http,
    interaction,
    blockingIssues,
    summary
  };
  writeReport(params.appDir, report);
  return report;
}
