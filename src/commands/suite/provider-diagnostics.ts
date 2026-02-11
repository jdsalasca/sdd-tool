import fs from "fs";
import path from "path";

export type ProviderIssueType = "none" | "unusable" | "quota" | "command_too_long";

const NOISE_PATTERN = /\bdep0040\b|punycode|loaded cached credentials|hook registry initialized/i;
const QUOTA_PATTERN = /quota|capacity|terminalquotaerror|429/i;
const CMD_TOO_LONG_PATTERN = /the command line is too long|linea de comandos es demasiado larga|la línea de comandos es demasiado larga/i;
const UNUSABLE_PATTERN =
  /provider response unusable|provider did not return valid files|no template fallback was applied|ready for your command|empty output/i;
const QUOTA_RESET_HINT_PATTERN = /quota will reset after\s+([^.,\n]+)/i;

function resolveRecentWindowMs(): number {
  const raw = Number.parseInt(process.env.SDD_PROVIDER_SIGNAL_WINDOW_MINUTES ?? "", 10);
  const minutes = Number.isFinite(raw) && raw > 0 ? Math.min(240, raw) : 30;
  return minutes * 60 * 1000;
}

function isFreshMs(ms: number, nowMs: number, windowMs: number): boolean {
  if (!Number.isFinite(ms) || ms <= 0) return false;
  return nowMs - ms <= windowMs;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function cleanText(text: string): string {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !NOISE_PATTERN.test(line))
    .join(" ");
}

function readRecentMetadataSignals(file: string, nowMs: number, windowMs: number): string[] {
  if (!fs.existsSync(file)) return [];
  try {
    const lines = fs
      .readFileSync(file, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-240);
    const out: string[] = [];
    for (const line of lines) {
      const parsed = parseJsonLine(line);
      if (!parsed) continue;
      const atRaw = String(parsed.at || "");
      const atMs = Date.parse(atRaw);
      if (Number.isFinite(atMs) && !isFreshMs(atMs, nowMs, windowMs)) {
        continue;
      }
      const joined = cleanText(
        [parsed.error, parsed.outputPreview, parsed.promptPreview].map((v) => String(v || "")).filter(Boolean).join(" ")
      );
      if (joined) out.push(joined);
    }
    return out.slice(-60);
  } catch {
    return [];
  }
}

function readRecentFileSignal(file: string, nowMs: number, windowMs: number): string {
  if (!fs.existsSync(file)) return "";
  try {
    const stat = fs.statSync(file);
    if (!isFreshMs(stat.mtimeMs, nowMs, windowMs)) {
      return "";
    }
    return cleanText(fs.readFileSync(file, "utf-8"));
  } catch {
    return "";
  }
}

export function detectProviderIssueType(projectRoot?: string): ProviderIssueType {
  if (!projectRoot) return "none";
  const nowMs = Date.now();
  const windowMs = resolveRecentWindowMs();
  const debugMeta = path.join(projectRoot, "debug", "provider-prompts.metadata.jsonl");
  const providerDebug = path.join(projectRoot, "generated-app", "provider-debug.md");
  const runStatus = path.join(projectRoot, "sdd-run-status.json");

  const samples = [
    ...readRecentMetadataSignals(debugMeta, nowMs, windowMs),
    readRecentFileSignal(providerDebug, nowMs, windowMs),
    readRecentFileSignal(runStatus, nowMs, windowMs)
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (samples.length === 0) return "none";
  if (samples.some((value) => CMD_TOO_LONG_PATTERN.test(value))) return "command_too_long";
  if (samples.some((value) => QUOTA_PATTERN.test(value))) return "quota";
  if (samples.some((value) => UNUSABLE_PATTERN.test(value))) return "unusable";
  return "none";
}

export function readRecentQuotaResetHint(projectRoot?: string): string {
  if (!projectRoot) return "";
  const nowMs = Date.now();
  const windowMs = resolveRecentWindowMs();
  const candidates = [
    path.join(projectRoot, "debug", "provider-prompts.metadata.jsonl"),
    path.join(projectRoot, "generated-app", "provider-debug.md"),
    path.join(projectRoot, "sdd-run-status.json")
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      if (file.endsWith(".jsonl")) {
        const lines = fs
          .readFileSync(file, "utf-8")
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(-240)
          .reverse();
        for (const line of lines) {
          const parsed = parseJsonLine(line);
          if (!parsed) continue;
          const atMs = Date.parse(String(parsed.at || ""));
          if (Number.isFinite(atMs) && !isFreshMs(atMs, nowMs, windowMs)) continue;
          const text = cleanText([parsed.error, parsed.outputPreview].map((v) => String(v || "")).join(" "));
          const hit = text.match(QUOTA_RESET_HINT_PATTERN);
          if (hit?.[1]) return String(hit[1]).trim();
        }
        continue;
      }
      const stat = fs.statSync(file);
      if (!isFreshMs(stat.mtimeMs, nowMs, windowMs)) continue;
      const raw = cleanText(fs.readFileSync(file, "utf-8"));
      const hit = raw.match(QUOTA_RESET_HINT_PATTERN);
      if (hit?.[1]) return String(hit[1]).trim();
    } catch {
      // best effort
    }
  }
  return "";
}
