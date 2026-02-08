import { codexProvider } from "./codex";
import { geminiProvider } from "./gemini";
import { AIProvider, ProviderId, ProviderPreference } from "./types";
import { ensureConfig } from "../config";

const PROVIDERS: Record<ProviderId, AIProvider> = {
  gemini: geminiProvider,
  codex: codexProvider
};

const AUTO_ORDER: ProviderId[] = ["gemini", "codex"];

function normalizePreference(input?: string): ProviderPreference | null {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === "auto" || raw === "gemini" || raw === "codex") {
    return raw;
  }
  return null;
}

export function defaultProviderPreference(): ProviderPreference {
  const fromEnv = normalizePreference(process.env.SDD_AI_PROVIDER_DEFAULT);
  if (fromEnv) {
    return fromEnv;
  }
  const config = ensureConfig();
  const fromConfig = normalizePreference(config.ai.preferred_cli);
  return fromConfig ?? "gemini";
}

export function parseProviderPreference(input?: string): ProviderPreference | null {
  return normalizePreference(input);
}

export function listProviders(): AIProvider[] {
  return AUTO_ORDER.map((id) => PROVIDERS[id]);
}

export type ProviderResolution =
  | { ok: true; provider: AIProvider; selected: ProviderId; requested: ProviderPreference }
  | { ok: false; requested: string; reason: "invalid" | "unavailable"; details: string };

export function resolveProvider(requested?: string): ProviderResolution {
  const normalized = normalizePreference(requested);
  if (!normalized) {
    return {
      ok: false,
      requested: requested ?? "",
      reason: "invalid",
      details: "Use one of: gemini, codex, auto."
    };
  }

  if (normalized === "auto") {
    const preferred = defaultProviderPreference();
    if (preferred !== "auto") {
      const provider = PROVIDERS[preferred];
      const status = provider.version();
      if (status.ok) {
        return { ok: true, provider, selected: preferred, requested: normalized };
      }
      return {
        ok: false,
        requested: normalized,
        reason: "unavailable",
        details: `${provider.label} not available: ${status.error || "provider unavailable"}`
      };
    }
    for (const id of AUTO_ORDER) {
      const provider = PROVIDERS[id];
      const status = provider.version();
      if (status.ok) {
        return { ok: true, provider, selected: id, requested: normalized };
      }
    }
    return {
      ok: false,
      requested: normalized,
      reason: "unavailable",
      details: "No provider available. Install/configure gemini or codex."
    };
  }

  const provider = PROVIDERS[normalized];
  const status = provider.version();
  if (!status.ok) {
    return {
      ok: false,
      requested: normalized,
      reason: "unavailable",
      details: `${provider.label} not available: ${status.error || "provider unavailable"}`
    };
  }

  return { ok: true, provider, selected: normalized, requested: normalized };
}
