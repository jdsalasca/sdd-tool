import { readStateJson, writeStateJson } from "../platform/persistence";

type ProviderModelEntry = {
  unavailableUntilMs: number;
  reason: string;
  hint: string;
  updatedAt: string;
};

type CacheState = {
  version: number;
  providers: Record<string, Record<string, ProviderModelEntry>>;
};

const CACHE_FILE = "state/model-availability-cache.json";
const CACHE_VERSION = 1;

function emptyState(): CacheState {
  return { version: CACHE_VERSION, providers: {} };
}

function loadState(): CacheState {
  const parsed = readStateJson<CacheState>(CACHE_FILE, emptyState());
  if (!parsed || typeof parsed !== "object") {
    return emptyState();
  }
  if (parsed.version !== CACHE_VERSION || typeof parsed.providers !== "object" || !parsed.providers) {
    return emptyState();
  }
  return parsed;
}

function saveState(state: CacheState): void {
  writeStateJson(CACHE_FILE, state);
}

export function parseResetHintToMs(hint: string): number | null {
  const text = String(hint || "").toLowerCase();
  if (!text.trim()) {
    return null;
  }
  const direct = text.match(/quota will reset after\s+([^.,\n]+)/i)?.[1] ?? text;
  const matches = [...direct.matchAll(/(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)/gi)];
  if (matches.length === 0) {
    return null;
  }
  let totalMs = 0;
  for (const match of matches) {
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value) || value < 0) {
      continue;
    }
    const unit = match[2].toLowerCase();
    if (unit.startsWith("h")) {
      totalMs += value * 60 * 60 * 1000;
    } else if (unit.startsWith("m")) {
      totalMs += value * 60 * 1000;
    } else {
      totalMs += value * 1000;
    }
  }
  return totalMs > 0 ? totalMs : null;
}

export function markModelUnavailable(
  provider: string,
  model: string,
  hint: string,
  fallbackMs = 60_000,
  nowMs = Date.now()
): void {
  const providerKey = String(provider || "").trim().toLowerCase();
  const modelKey = String(model || "").trim();
  if (!providerKey || !modelKey) {
    return;
  }
  const waitMs = parseResetHintToMs(hint) ?? Math.max(1000, fallbackMs);
  const state = loadState();
  if (!state.providers[providerKey]) {
    state.providers[providerKey] = {};
  }
  state.providers[providerKey][modelKey] = {
    unavailableUntilMs: nowMs + waitMs,
    reason: "quota_or_capacity",
    hint: String(hint || "").trim(),
    updatedAt: new Date(nowMs).toISOString()
  };
  saveState(state);
}

export function isModelUnavailable(provider: string, model: string, nowMs = Date.now()): boolean {
  const providerKey = String(provider || "").trim().toLowerCase();
  const modelKey = String(model || "").trim();
  if (!providerKey || !modelKey) {
    return false;
  }
  const state = loadState();
  const entry = state.providers[providerKey]?.[modelKey];
  if (!entry) {
    return false;
  }
  return Number(entry.unavailableUntilMs || 0) > nowMs;
}

export function listUnavailableModels(provider: string, nowMs = Date.now()): string[] {
  const providerKey = String(provider || "").trim().toLowerCase();
  if (!providerKey) {
    return [];
  }
  const state = loadState();
  const modelMap = state.providers[providerKey] || {};
  return Object.entries(modelMap)
    .filter(([, entry]) => Number(entry?.unavailableUntilMs || 0) > nowMs)
    .map(([name]) => name);
}

export function nextAvailabilityMs(provider: string, nowMs = Date.now()): number | null {
  const providerKey = String(provider || "").trim().toLowerCase();
  if (!providerKey) {
    return null;
  }
  const state = loadState();
  const modelMap = state.providers[providerKey] || {};
  const deltas = Object.values(modelMap)
    .map((entry) => Number(entry?.unavailableUntilMs || 0) - nowMs)
    .filter((delta) => Number.isFinite(delta) && delta > 0);
  if (deltas.length === 0) {
    return null;
  }
  return Math.min(...deltas);
}

export function clearExpiredModelAvailability(nowMs = Date.now()): void {
  const state = loadState();
  let touched = false;
  for (const provider of Object.keys(state.providers)) {
    const entries = state.providers[provider];
    for (const model of Object.keys(entries)) {
      if (Number(entries[model]?.unavailableUntilMs || 0) <= nowMs) {
        delete entries[model];
        touched = true;
      }
    }
    if (Object.keys(entries).length === 0) {
      delete state.providers[provider];
      touched = true;
    }
  }
  if (touched) {
    saveState(state);
  }
}

