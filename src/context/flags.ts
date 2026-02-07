export type RuntimeFlags = {
  approve: boolean;
  improve: boolean;
  parallel: boolean;
  nonInteractive: boolean;
  project?: string;
  output?: string;
};

const flags: RuntimeFlags = {
  approve: false,
  improve: false,
  parallel: false,
  nonInteractive: false,
  project: undefined,
  output: undefined
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
  if ("project" in next) {
    flags.project = typeof next.project === "string" ? next.project : undefined;
  }
  if ("output" in next) {
    flags.output = typeof next.output === "string" ? next.output : undefined;
  }
}

export function getFlags(): RuntimeFlags {
  return { ...flags };
}
