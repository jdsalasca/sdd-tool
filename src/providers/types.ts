export type ProviderId = "gemini" | "codex";
export type ProviderPreference = ProviderId | "auto";

export type ProviderResult = {
  ok: boolean;
  output: string;
  error?: string;
};

export type AIProvider = {
  id: ProviderId;
  label: string;
  version: () => ProviderResult;
  exec: (prompt: string) => ProviderResult;
};

