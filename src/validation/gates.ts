type RequirementPayload = {
  objective?: string;
  scope?: { in?: string[]; out?: string[] };
  acceptanceCriteria?: string[];
  nfrs?: { security?: string; performance?: string; availability?: string };
};

export type GateResult = { ok: boolean; missing: string[] };

function isMissingText(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.toUpperCase() === "N/A";
}

function isMissingList(values: string[] | undefined): boolean {
  if (!values || values.length === 0) {
    return true;
  }
  return values.every((value) => isMissingText(value));
}

export function checkRequirementGates(payload: RequirementPayload): GateResult {
  const missing: string[] = [];
  if (isMissingText(payload.objective)) {
    missing.push("objective");
  }
  if (isMissingList(payload.scope?.in)) {
    missing.push("scope.in");
  }
  if (isMissingList(payload.scope?.out)) {
    missing.push("scope.out");
  }
  if (isMissingList(payload.acceptanceCriteria)) {
    missing.push("acceptanceCriteria");
  }
  if (isMissingText(payload.nfrs?.security)) {
    missing.push("nfrs.security");
  }
  if (isMissingText(payload.nfrs?.performance)) {
    missing.push("nfrs.performance");
  }
  if (isMissingText(payload.nfrs?.availability)) {
    missing.push("nfrs.availability");
  }
  return { ok: missing.length === 0, missing };
}
