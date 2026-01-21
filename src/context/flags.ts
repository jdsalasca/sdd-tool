export type RuntimeFlags = {
  approve: boolean;
  improve: boolean;
  parallel: boolean;
  project?: string;
  output?: string;
};

const flags: RuntimeFlags = {
  approve: false,
  improve: false,
  parallel: false,
  project: undefined,
  output: undefined
};

export function setFlags(next: Partial<RuntimeFlags>): void {
  flags.approve = Boolean(next.approve);
  flags.improve = Boolean(next.improve);
  flags.parallel = Boolean(next.parallel);
  flags.project = typeof next.project === "string" ? next.project : undefined;
  flags.output = typeof next.output === "string" ? next.output : undefined;
}

export function getFlags(): RuntimeFlags {
  return { ...flags };
}
