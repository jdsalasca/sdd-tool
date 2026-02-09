export type RuntimeFlags = {
  approve: boolean;
  improve: boolean;
  parallel: boolean;
  nonInteractive: boolean;
  dryRun: boolean;
  beginner: boolean;
  fromStep?: string;
  project?: string;
  output?: string;
  scope?: string;
  metricsLocal?: boolean;
  provider?: string;
  model?: string;
  iterations: number;
  maxRuntimeMinutes?: number;
};

const flags: RuntimeFlags = {
  approve: false,
  improve: false,
  parallel: false,
  nonInteractive: false,
  dryRun: false,
  beginner: false,
  fromStep: undefined,
  project: undefined,
  output: undefined,
  scope: undefined,
  metricsLocal: false,
  provider: process.env.SDD_AI_PROVIDER_DEFAULT ?? "gemini",
  model: process.env.SDD_AI_MODEL_DEFAULT,
  iterations: 2,
  maxRuntimeMinutes: undefined
};

export function setFlags(next: Partial<RuntimeFlags>): void {
  if ("approve" in next) {
    flags.approve = Boolean(next.approve);
  }
  if ("improve" in next) {
    flags.improve = Boolean(next.improve);
  }
  if ("parallel" in next) {
    flags.parallel = Boolean(next.parallel);
  }
  if ("nonInteractive" in next) {
    flags.nonInteractive = Boolean(next.nonInteractive);
  }
  if ("dryRun" in next) {
    flags.dryRun = Boolean(next.dryRun);
  }
  if ("beginner" in next) {
    flags.beginner = Boolean(next.beginner);
  }
  if ("fromStep" in next) {
    flags.fromStep = typeof next.fromStep === "string" ? next.fromStep : undefined;
  }
  if ("project" in next) {
    flags.project = typeof next.project === "string" ? next.project : undefined;
  }
  if ("output" in next) {
    flags.output = typeof next.output === "string" ? next.output : undefined;
  }
  if ("scope" in next) {
    flags.scope = typeof next.scope === "string" ? next.scope : undefined;
  }
  if ("metricsLocal" in next) {
    flags.metricsLocal = Boolean(next.metricsLocal);
  }
  if ("provider" in next) {
    flags.provider = typeof next.provider === "string" ? next.provider : flags.provider;
  }
  if ("model" in next) {
    flags.model = typeof next.model === "string" ? next.model : flags.model;
  }
  if ("iterations" in next) {
    const raw = Number(next.iterations);
    flags.iterations = Number.isFinite(raw) ? Math.trunc(raw) : flags.iterations;
  }
  if ("maxRuntimeMinutes" in next) {
    const raw = Number(next.maxRuntimeMinutes);
    flags.maxRuntimeMinutes = Number.isFinite(raw) ? Math.trunc(raw) : flags.maxRuntimeMinutes;
  }
}

export function getFlags(): RuntimeFlags {
  return { ...flags };
}
