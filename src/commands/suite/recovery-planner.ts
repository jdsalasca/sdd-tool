import type { ProviderIssueType } from "./provider-diagnostics";
import type { BlockingSignals } from "./blocking-signals";

export type RecoveryTier = "none" | "tier1" | "tier2" | "tier3" | "tier4";

export function resolveRecoveryTier(streak: number, stalledCycles: number): RecoveryTier {
  if (streak >= 5 || stalledCycles >= 4) return "tier4";
  if (streak >= 4 || stalledCycles >= 3) return "tier3";
  if (streak >= 2 || stalledCycles >= 2) return "tier2";
  if (streak >= 1) return "tier1";
  return "none";
}

export function buildRecoveryPlan(tier: RecoveryTier, signals: BlockingSignals): {
  additions: string[];
  action: string;
  forceCreateNextCycle: boolean;
  enableCompactMode: boolean;
} {
  const blockerHints = deriveBlockerHints(signals.blockers);
  const baseHints = signals.blockers.slice(0, 5).join(" | ");
  if (tier === "tier4") {
    return {
      additions: [
        "Autonomous recovery tier4: perform deep rebuild with strict stage gate enforcement and regenerate artifacts before coding.",
        "Resolve blockers from lifecycle/run-status first, then continue toward release with full quality evidence.",
        ...blockerHints
      ],
      action: `tier4 deep recovery + forced create. blockers=${baseHints || "none"}`,
      forceCreateNextCycle: true,
      enableCompactMode: true
    };
  }
  if (tier === "tier3") {
    return {
      additions: [
        "Autonomous recovery tier3: convert unresolved blockers into prioritized P0/P1 stories and implement all P0 immediately.",
        "Re-run quality gates after each fix and provide strict JSON-only file payload.",
        ...blockerHints
      ],
      action: `tier3 strict remediation. blockers=${baseHints || "none"}`,
      forceCreateNextCycle: false,
      enableCompactMode: true
    };
  }
  if (tier === "tier2") {
    return {
      additions: [
        "Autonomous recovery tier2: focus only on failing gates and missing artifacts, avoid scope expansion.",
        "Deliver minimal high-confidence edits that close blockers.",
        ...blockerHints
      ],
      action: `tier2 gate-focused remediation. blockers=${baseHints || "none"}`,
      forceCreateNextCycle: false,
      enableCompactMode: true
    };
  }
  if (tier === "tier1") {
    return {
      additions: [
        "Autonomous recovery tier1: fix blocking failures first and keep release path aligned with mandatory stages.",
        ...blockerHints
      ],
      action: `tier1 recovery prompt boost. blockers=${baseHints || "none"}`,
      forceCreateNextCycle: false,
      enableCompactMode: false
    };
  }
  return { additions: [], action: "no-op", forceCreateNextCycle: false, enableCompactMode: false };
}

function deriveBlockerHints(blockers: string[]): string[] {
  const joined = blockers.join("\n").toLowerCase();
  const hints: string[] = [];
  if (
    /missing dependency|cannot find module|preset ts-jest not found|eslint couldn't find the plugin|eresolve|peer dependency/.test(
      joined
    )
  ) {
    hints.push(
      "Dependency remediation: align package.json dependencies/devDependencies with imports and eslint/jest presets, then run clean install and regenerate lockfile."
    );
  }
  if (/unknown option \"collectcoverage\"|setupfilesafterenv option was not found|jest config uses ts-jest/.test(joined)) {
    hints.push(
      "Test configuration remediation: fix Jest configuration to match installed tooling, remove invalid options, and ensure referenced setup files exist."
    );
  }
  if (/missing smoke script|smoke\/e2e|npm run smoke/.test(joined)) {
    hints.push("Quality gate remediation: add runnable smoke/e2e script and keep it green in lifecycle validation.");
  }
  if (/vision\.md is incomplete|architecture\.md.*incomplete|placeholder content/.test(joined)) {
    hints.push(
      "Documentation remediation: regenerate missing/incomplete docs with concrete architecture, mission, vision, and integration details (no placeholders)."
    );
  }
  if (/\"npm\" no se reconoce|not recognized as an internal or external command/.test(joined)) {
    hints.push(
      "Windows runtime remediation: ensure commands execute through npm.cmd in scripts and avoid shell recursion that re-enters the same top-level build command."
    );
  }
  return [...new Set(hints)];
}

export function categorizeRootCauses(blockers: string[], providerIssue: ProviderIssueType): string[] {
  const joined = blockers.join("\n").toLowerCase();
  const causes: string[] = [];
  if (/etarget|no matching version found|npm error 404/.test(joined)) {
    causes.push("invalid_or_unavailable_dependency_versions");
  }
  if (/no se reconoce como un comando interno o externo|not recognized as an internal or external command/.test(joined)) {
    causes.push("missing_runtime_dependencies_after_failed_install");
  }
  if (/missing smoke|smoke\/e2e/.test(joined)) {
    causes.push("missing_smoke_validation_script");
  }
  if (/write_file|cannot directly create or modify files|unable to fulfill this request/.test(joined)) {
    causes.push("provider_non_contractual_response");
  }
  if (providerIssue === "quota") {
    causes.push("provider_quota_or_capacity_exhausted");
  }
  if (providerIssue === "command_too_long") {
    causes.push("provider_cli_prompt_length_overflow");
  }
  return [...new Set(causes)];
}
