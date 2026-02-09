import fs from "fs";
import path from "path";

export type DeliveryStage =
  | "discovery"
  | "functional_requirements"
  | "technical_backlog"
  | "implementation"
  | "quality_validation"
  | "role_review"
  | "release_candidate"
  | "final_release"
  | "runtime_start";

export type StageState = "pending" | "passed" | "failed";

type StageRecord = {
  stage: DeliveryStage;
  state: StageState;
  at: string;
  details?: string;
};

type StageSnapshot = {
  version: 1;
  stages: Record<DeliveryStage, StageState>;
  history: StageRecord[];
};

const ORDER: DeliveryStage[] = [
  "discovery",
  "functional_requirements",
  "technical_backlog",
  "implementation",
  "quality_validation",
  "role_review",
  "release_candidate",
  "final_release",
  "runtime_start"
];

function stageFile(projectRoot: string): string {
  return path.join(projectRoot, ".sdd-stage-state.json");
}

function emptySnapshot(): StageSnapshot {
  return {
    version: 1,
    stages: {
      discovery: "pending",
      functional_requirements: "pending",
      technical_backlog: "pending",
      implementation: "pending",
      quality_validation: "pending",
      role_review: "pending",
      release_candidate: "pending",
      final_release: "pending",
      runtime_start: "pending"
    },
    history: []
  };
}

export function loadStageSnapshot(projectRoot: string): StageSnapshot {
  const file = stageFile(projectRoot);
  if (!fs.existsSync(file)) {
    return emptySnapshot();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<StageSnapshot>;
    const base = emptySnapshot();
    const stages = { ...base.stages, ...(raw.stages ?? {}) } as Record<DeliveryStage, StageState>;
    const history = Array.isArray(raw.history) ? raw.history : [];
    return { version: 1, stages, history };
  } catch {
    return emptySnapshot();
  }
}

export function saveStageSnapshot(projectRoot: string, snapshot: StageSnapshot): void {
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(stageFile(projectRoot), JSON.stringify(snapshot, null, 2), "utf-8");
}

export function canEnterStage(snapshot: StageSnapshot, target: DeliveryStage): { ok: boolean; reason?: string } {
  const index = ORDER.indexOf(target);
  if (index <= 0) {
    return { ok: true };
  }
  for (let i = 0; i < index; i += 1) {
    const prev = ORDER[i];
    if (snapshot.stages[prev] !== "passed") {
      return { ok: false, reason: `Cannot enter ${target}; prerequisite stage ${prev} is ${snapshot.stages[prev]}.` };
    }
  }
  return { ok: true };
}

export function markStage(projectRoot: string, stage: DeliveryStage, state: StageState, details?: string): StageSnapshot {
  const snapshot = loadStageSnapshot(projectRoot);
  snapshot.stages[stage] = state;
  snapshot.history.push({
    stage,
    state,
    at: new Date().toISOString(),
    details
  });
  if (snapshot.history.length > 300) {
    snapshot.history = snapshot.history.slice(snapshot.history.length - 300);
  }
  saveStageSnapshot(projectRoot, snapshot);
  return snapshot;
}

export const __internal = {
  ORDER
};
