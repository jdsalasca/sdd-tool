export type ProviderId = "gemini" | "codex";
export type ProviderPreference = ProviderId | "auto";

export type ProviderResult = {
  ok: boolean;
  output: string;
  error?: string;
};

export type ModelSelectionReason = "initial" | "provider_quota" | "provider_unusable" | "provider_command_too_long";

export type ModelSelectionContext = {
  configuredModel?: string;
  currentModel?: string;
  reason: ModelSelectionReason;
  failureStreak: number;
  triedModels: string[];
};

export type AIProvider = {
  id: ProviderId;
  label: string;
  version: () => ProviderResult;
  exec: (prompt: string) => ProviderResult;
  chooseModel: (context: ModelSelectionContext) => string | undefined;
};

