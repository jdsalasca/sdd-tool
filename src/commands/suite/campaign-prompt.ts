/**
 * Prompt normalization helpers for long-running suite campaigns.
 * Keeps the goal anchor stable and avoids repeated noisy segments.
 */
export function normalizeCampaignInput(baseInput: string, additions: string[]): string {
  const chunks = [baseInput, ...additions]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const merged = chunks.join(". ");
  const segments = merged
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (!seen.has(key)) {
      deduped.push(segment);
      seen.add(key);
    }
  }
  const filtered = deduped.filter((segment) => {
    const lower = segment.toLowerCase();
    if (lower.startsWith("build target:")) return false;
    if (lower.startsWith("preferred stack:")) return false;
    if (lower.startsWith("finish complete delivery")) return false;
    return true;
  });
  const normalized = filtered.join(". ");
  const maxChars = 900;
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...[truncated]` : normalized;
}

export function deriveCanonicalGoal(input: string): string {
  const compact = String(input || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const segments = compact
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((segment) => {
      const lower = segment.toLowerCase();
      if (lower.startsWith("build target:")) return false;
      if (lower.startsWith("preferred stack:")) return false;
      if (lower.startsWith("finish complete delivery")) return false;
      if (lower.includes("continue from the current project state")) return false;
      return true;
    });
  const joined = segments.slice(0, 2).join(". ").trim();
  const maxChars = 220;
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

export function composeCampaignInput(goalAnchor: string, baseInput: string, additions: string[]): string {
  const anchor = goalAnchor ? `Primary product objective (do not drift): ${goalAnchor}` : "";
  const cleanedBase = String(baseInput || "")
    .replace(/primary product objective \(do not drift\):/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const seeded = anchor ? `${anchor}. ${cleanedBase}` : cleanedBase;
  return normalizeCampaignInput(seeded, additions);
}
