export type RuntimeFlags = {
  approve: boolean;
  improve: boolean;
  parallel: boolean;
};

const flags: RuntimeFlags = {
  approve: false,
  improve: false,
  parallel: false
};

export function setFlags(next: Partial<RuntimeFlags>): void {
  flags.approve = Boolean(next.approve);
  flags.improve = Boolean(next.improve);
  flags.parallel = Boolean(next.parallel);
}

export function getFlags(): RuntimeFlags {
  return { ...flags };
}
