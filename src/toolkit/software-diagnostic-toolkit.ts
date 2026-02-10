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
  htmlSnippet: string;
  summary: string;
};

export type RuntimeInteractionAction = {
  at: string;
  action: string;
  target: string;
  result: "ok" | "failed" | "skipped";
  detail?: string;
  screenshot?: string;
};

export type FunctionalCheck = {
  name: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
};

export type RuntimeInteractionProbe = {
  status: ToolkitProbeStatus;
  url: string;
  rounds: number;
  clickableCount: number;
  clicksPerformed: number;
  uiLabels: string[];
  consoleErrors: string[];
  pageErrors: string[];
  blankLikely: boolean;
  screenshotBefore: string;
  screenshotAfter: string;
  actionTimeline: RuntimeInteractionAction[];
  functionalChecks: FunctionalCheck[];
  summary: string;
};

export type SoftwareDiagnosticReport = {
  at: string;
  goalText: string;
  visual: RuntimeVisualProbeResult;
  http: RuntimeHttpProbe;
  interaction: RuntimeInteractionProbe;
  blockingIssues: string[];
  qualityScore: number;
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

function extractUiLabelsFromHtml(input: string): string[] {
  const html = String(input || "");
  if (!html) return [];
  const labels = new Set<string>();
  const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  let btnMatch: RegExpExecArray | null;
  while ((btnMatch = buttonRegex.exec(html)) !== null) {
    const text = String(btnMatch[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) labels.add(text.slice(0, 60));
  }
  const attrRegex = /(aria-label|title|placeholder|value)\s*=\s*"([^"]+)"/gi;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(html)) !== null) {
    const value = String(attrMatch[2] || "").trim();
    if (value) labels.add(value.slice(0, 60));
  }
  return [...labels].slice(0, 80);
}

function detectCalculatorGoal(goalText: string): boolean {
  const goal = String(goalText || "").toLowerCase();
  return /\bcalculator\b|\bcalculadora\b/.test(goal);
}

function assessCalculatorControls(uiLabels: string[]): FunctionalCheck {
  const labelSpace = uiLabels.join(" ").toLowerCase();
  const requiredTokens = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "-", "*", "/", "="];
  const missing = requiredTokens.filter((token) => !labelSpace.includes(token));
  if (missing.length > 0) {
    return {
      name: "calculator_controls_present",
      status: "failed",
      detail: `missing calculator controls: ${missing.slice(0, 10).join(", ")}`
    };
  }
  return {
    name: "calculator_controls_present",
    status: "passed",
    detail: "calculator controls detected in UI labels"
  };
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
          const contentType = String(res.headers.get("content-type") || "").toLowerCase();
          let htmlSnippet = "";
          if (contentType.includes("text") || contentType.includes("json") || contentType.includes("html")) {
            try {
              const body = await res.text();
              htmlSnippet = body.slice(0, 12000);
            } catch {
              htmlSnippet = "";
            }
          }
          return {
            status: ToolkitProbeStatus.Passed,
            testedUrls: tested,
            reachableUrl: url,
            httpStatus: res.status,
            htmlSnippet,
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
    htmlSnippet: "",
    summary: `runtime http probe failed after ${retries} retries`
  };
}

async function runInteractionProbe(
  appDir: string,
  reachableUrl: string,
  goalText: string,
  htmlSnippet: string
): Promise<RuntimeInteractionProbe> {
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
      rounds: 0,
      clickableCount: 0,
      clicksPerformed: 0,
      uiLabels: [],
      consoleErrors: [],
      pageErrors: [],
      blankLikely: false,
      screenshotBefore: before,
      screenshotAfter: after,
      actionTimeline: [],
      functionalChecks: [
        {
          name: "runtime_reachable",
          status: "failed",
          detail: "no reachable runtime URL"
        }
      ],
      summary: "interaction probe skipped: no reachable runtime URL"
    };
  }

  const timeline: RuntimeInteractionAction[] = [];
  const goalIsCalculator = detectCalculatorGoal(goalText);
  const baselineLabels = extractUiLabelsFromHtml(htmlSnippet);

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
    await page.goto(reachableUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.screenshot({ path: before, fullPage: true });
    timeline.push({ at: new Date().toISOString(), action: "open", target: reachableUrl, result: "ok", screenshot: before });

    const clickableSelector = "button, [role='button'], a[href], input[type='submit']";
    const clickableCount = await page.locator(clickableSelector).count();
    const maxClicksRaw = Number.parseInt(process.env.SDD_RUNTIME_INTERACTION_CLICKS ?? "", 10);
    const maxClicks = Number.isFinite(maxClicksRaw) && maxClicksRaw > 0 ? Math.min(10, maxClicksRaw) : 4;
    const roundsRaw = Number.parseInt(process.env.SDD_RUNTIME_INTERACTION_ROUNDS ?? "", 10);
    const rounds = Number.isFinite(roundsRaw) && roundsRaw > 0 ? Math.min(6, roundsRaw) : 2;
    let clicksPerformed = 0;

    for (let round = 1; round <= rounds; round += 1) {
      const count = Math.min(clickableCount, maxClicks);
      for (let i = 0; i < count; i += 1) {
        const item = page.locator(clickableSelector).nth(i);
        try {
          await item.click({ timeout: 1400 });
          clicksPerformed += 1;
          timeline.push({ at: new Date().toISOString(), action: `click#${round}`, target: `${clickableSelector}[${i}]`, result: "ok" });
          await page.waitForTimeout(250);
        } catch (error) {
          timeline.push({
            at: new Date().toISOString(),
            action: `click#${round}`,
            target: `${clickableSelector}[${i}]`,
            result: "failed",
            detail: String(error).slice(0, 140)
          });
        }
      }
      const roundShot = path.join(shotsDir, `interaction-${stamp}-round-${round}.png`);
      try {
        await page.screenshot({ path: roundShot, fullPage: true });
        timeline.push({ at: new Date().toISOString(), action: `snapshot#${round}`, target: "fullPage", result: "ok", screenshot: roundShot });
      } catch {
        // best effort
      }
      await page.waitForTimeout(300);
    }

    const uiLabels = await page
      .locator("button, [role='button'], [aria-label], input[placeholder], a[href]")
      .evaluateAll((nodes: Element[]) => {
        const labels = new Set<string>();
        for (const node of nodes) {
          const el = node as HTMLElement;
          const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          const aria = el.getAttribute("aria-label") || "";
          const title = el.getAttribute("title") || "";
          const placeholder = el.getAttribute("placeholder") || "";
          [text, aria, title, placeholder].forEach((value) => {
            if (value && value.trim().length > 0) labels.add(value.trim().slice(0, 60));
          });
        }
        return [...labels].slice(0, 100);
      });

    const functionalChecks: FunctionalCheck[] = [];
    functionalChecks.push({
      name: "interactive_controls_present",
      status: clickableCount > 0 ? "passed" : "failed",
      detail: clickableCount > 0 ? `detected ${clickableCount} clickable controls` : "no clickable controls detected"
    });

    if (goalIsCalculator) {
      const controlsCheck = assessCalculatorControls(uiLabels);
      functionalChecks.push(controlsCheck);

      let calculatorFlow: FunctionalCheck = {
        name: "calculator_basic_operation_1_plus_1",
        status: "skipped",
        detail: "calculator runtime flow not executed"
      };
      try {
        const candidates = ["text=1", "button:has-text('1')", "[aria-label='1']"];
        const plusCandidates = ["text=+", "button:has-text('+')", "[aria-label='plus']", "[aria-label='add']"];
        const equalsCandidates = ["text==", "button:has-text('=')", "[aria-label='equals']"];
        const findAndClick = async (selectors: string[]): Promise<boolean> => {
          for (const selector of selectors) {
            const locator = page.locator(selector).first();
            if ((await locator.count()) > 0) {
              try {
                await locator.click({ timeout: 1200 });
                timeline.push({ at: new Date().toISOString(), action: "calculator-click", target: selector, result: "ok" });
                return true;
              } catch {
                // continue trying
              }
            }
          }
          return false;
        };

        const clicked1A = await findAndClick(candidates);
        const clickedPlus = await findAndClick(plusCandidates);
        const clicked1B = await findAndClick(candidates);
        const clickedEq = await findAndClick(equalsCandidates);

        if (clicked1A && clickedPlus && clicked1B && clickedEq) {
          await page.waitForTimeout(300);
          const displayText = await page.evaluate(() => {
            const selectors = ["[aria-live]", "input", ".display", "#display", "[data-testid='display']", ".result", "#result"];
            for (const selector of selectors) {
              const node = document.querySelector(selector) as HTMLElement | HTMLInputElement | null;
              if (!node) continue;
              const value = (node as HTMLInputElement).value || node.textContent || "";
              if (String(value).trim()) return String(value).trim();
            }
            return (document.body?.innerText || "").slice(0, 400);
          });
          const pass = /(^|\D)2(\D|$)/.test(displayText);
          calculatorFlow = {
            name: "calculator_basic_operation_1_plus_1",
            status: pass ? "passed" : "failed",
            detail: pass ? "1 + 1 produced a result containing 2" : `expected result 2 not detected; observed: ${displayText.slice(0, 120)}`
          };
        } else {
          calculatorFlow = {
            name: "calculator_basic_operation_1_plus_1",
            status: "failed",
            detail: "could not execute calculator click path (1,+,1,=)"
          };
        }
      } catch (error) {
        calculatorFlow = {
          name: "calculator_basic_operation_1_plus_1",
          status: "failed",
          detail: `calculator runtime check error: ${String(error).slice(0, 140)}`
        };
      }
      functionalChecks.push(calculatorFlow);
    }

    await page.screenshot({ path: after, fullPage: true });
    const textLen = await page.evaluate(() => (document.body?.innerText || "").trim().length);
    const blankLikely = textLen < 25 && clickableCount === 0;
    await browser.close();

    return {
      status: ToolkitProbeStatus.Passed,
      url: reachableUrl,
      rounds,
      clickableCount,
      clicksPerformed,
      uiLabels: [...new Set([...baselineLabels, ...uiLabels])].slice(0, 120),
      consoleErrors: consoleErrors.slice(0, 30),
      pageErrors: pageErrors.slice(0, 30),
      blankLikely,
      screenshotBefore: before,
      screenshotAfter: after,
      actionTimeline: timeline.slice(-80),
      functionalChecks,
      summary: `interaction probe done on ${reachableUrl}: clickable=${clickableCount}, clicks=${clicksPerformed}, rounds=${rounds}, checks=${functionalChecks.length}, pageErrors=${pageErrors.length}${blankLikely ? ", blank-likely" : ""}`
    };
  } catch (error) {
    const checks: FunctionalCheck[] = [];
    if (goalIsCalculator) {
      checks.push(assessCalculatorControls(baselineLabels));
      checks.push({
        name: "calculator_basic_operation_1_plus_1",
        status: "skipped",
        detail: "playwright unavailable; calculator runtime flow skipped"
      });
    }
    return {
      status: ToolkitProbeStatus.Skipped,
      url: reachableUrl,
      rounds: 0,
      clickableCount: 0,
      clicksPerformed: 0,
      uiLabels: baselineLabels,
      consoleErrors: [],
      pageErrors: [],
      blankLikely: false,
      screenshotBefore: before,
      screenshotAfter: after,
      actionTimeline: [
        {
          at: new Date().toISOString(),
          action: "playwright-import",
          target: "playwright",
          result: "failed",
          detail: String(error).slice(0, 180)
        }
      ],
      functionalChecks: checks,
      summary: `interaction probe skipped: playwright unavailable (${String(error).slice(0, 160)})`
    };
  }
}

function inferBlockingIssues(report: { visual: RuntimeVisualProbeResult; http: RuntimeHttpProbe; interaction: RuntimeInteractionProbe; goalText?: string }): string[] {
  const issues: string[] = [];
  const goal = (report.goalText || "").toLowerCase();
  const desktopGoal = /\bdesktop\b|\bwindows\b|\bmac\b|\belectron\b/.test(goal);
  const calculatorGoal = detectCalculatorGoal(goal);

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
  if (report.interaction.clickableCount === 0 && report.interaction.status !== ToolkitProbeStatus.Skipped) {
    issues.push("interactive UI controls were not detected");
  }
  const failedChecks = report.interaction.functionalChecks.filter((check) => check.status === "failed");
  for (const check of failedChecks.slice(0, 6)) {
    issues.push(`functional check failed: ${check.name} (${check.detail})`);
  }
  if (desktopGoal && !report.visual.captured) {
    issues.push("desktop goal requires successful runtime screenshot capture");
  }
  if (calculatorGoal) {
    const calcFlow = report.interaction.functionalChecks.find((check) => check.name === "calculator_basic_operation_1_plus_1");
    if (calcFlow && calcFlow.status === "failed") {
      issues.push("calculator basic operation (1+1=2) did not pass runtime verification");
    }
  }
  return issues;
}

function computeQualityScore(report: { visual: RuntimeVisualProbeResult; http: RuntimeHttpProbe; interaction: RuntimeInteractionProbe; blockingIssues: string[] }): number {
  let score = 100;
  if (report.http.status !== ToolkitProbeStatus.Passed) score -= 35;
  if (report.visual.blankLikely) score -= 25;
  if (report.visual.staticLikely) score -= 15;
  if (report.interaction.blankLikely) score -= 15;
  score -= Math.min(30, report.interaction.pageErrors.length * 6);
  score -= Math.min(20, report.interaction.consoleErrors.length * 3);
  score -= Math.min(40, report.blockingIssues.length * 8);
  return Math.max(0, Math.min(100, score));
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
    `- qualityScore: ${report.qualityScore}`,
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
    `- rounds: ${report.interaction.rounds}`,
    `- clickableCount: ${report.interaction.clickableCount}`,
    `- clicksPerformed: ${report.interaction.clicksPerformed}`,
    `- pageErrors: ${report.interaction.pageErrors.length}`,
    `- consoleErrors: ${report.interaction.consoleErrors.length}`,
    `- uiLabels: ${report.interaction.uiLabels.length}`,
    "",
    "## Functional Checks",
    ...(report.interaction.functionalChecks.length > 0
      ? report.interaction.functionalChecks.map((check) => `- ${check.status.toUpperCase()}: ${check.name} -> ${check.detail}`)
      : ["- none"]),
    "",
    "## Blocking Issues",
    ...(report.blockingIssues.length > 0 ? report.blockingIssues.map((line) => `- ${line}`) : ["- none"]),
    "",
    "## Action Timeline (latest 20)",
    ...(report.interaction.actionTimeline.length > 0
      ? report.interaction.actionTimeline.slice(-20).map((item) => `- ${item.at} | ${item.action} | ${item.target} | ${item.result}${item.detail ? ` | ${item.detail}` : ""}`)
      : ["- none"])
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
  const interaction = await runInteractionProbe(params.appDir, http.reachableUrl, params.goalText ?? "", http.htmlSnippet);
  const blockingIssues = inferBlockingIssues({
    visual,
    http,
    interaction,
    goalText: params.goalText
  });
  const qualityScore = computeQualityScore({ visual, http, interaction, blockingIssues });
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
    qualityScore,
    summary
  };
  writeReport(params.appDir, report);
  return report;
}
