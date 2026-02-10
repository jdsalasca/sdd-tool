import fs from "fs";
import path from "path";

export type AutonomousFeedbackAction = {
  priority: "P0" | "P1" | "P2";
  title: string;
  rationale: string;
  evidence: string[];
};

export type AutonomousFeedbackReport = {
  at: string;
  phase: string;
  diagnosticsCount: number;
  rootCauses: string[];
  actions: AutonomousFeedbackAction[];
  summary: string;
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function detectRootCauses(diagnostics: string[]): string[] {
  const joined = diagnostics.join("\n").toLowerCase();
  const causes: string[] = [];
  if (/etarget|no matching version found|npm error 404/.test(joined)) causes.push("invalid_dependency_versions");
  if (/not recognized as an internal or external command|no se reconoce como un comando interno o externo/.test(joined)) {
    causes.push("runtime_tools_unavailable_after_failed_install");
  }
  if (/missing smoke|smoke\/e2e|missing smoke script/.test(joined)) causes.push("missing_smoke_gate");
  if (/ts-jest|typescript tests detected/.test(joined)) causes.push("test_stack_mismatch");
  if (/provider response unusable|did not return valid files|ready for your command|empty output/.test(joined)) {
    causes.push("provider_non_contractual_output");
  }
  if (/too long|linea de comandos es demasiado larga|la línea de comandos es demasiado larga/.test(joined)) {
    causes.push("provider_cli_command_length_overflow");
  }
  if (/quota|capacity|429|terminalquotaerror/.test(joined)) causes.push("provider_quota_or_capacity");
  if (/placeholder|mission\.md is incomplete|missing readme/.test(joined)) causes.push("documentation_quality_gap");
  return unique(causes);
}

function buildActions(diagnostics: string[], rootCauses: string[]): AutonomousFeedbackAction[] {
  const actions: AutonomousFeedbackAction[] = [];
  const byCause = new Set(rootCauses);
  if (byCause.has("invalid_dependency_versions")) {
    actions.push({
      priority: "P0",
      title: "Stabilize package dependency graph",
      rationale: "Install must pass before any other quality gate can be trusted.",
      evidence: diagnostics.filter((line) => /etarget|notarget|npm error 404/i.test(line)).slice(0, 4)
    });
  }
  if (byCause.has("runtime_tools_unavailable_after_failed_install")) {
    actions.push({
      priority: "P0",
      title: "Restore test/build executables after install",
      rationale: "Missing jest/eslint/electron-builder indicates dependency installation failed or scripts are inconsistent.",
      evidence: diagnostics.filter((line) => /not recognized|no se reconoce/i.test(line)).slice(0, 4)
    });
  }
  if (byCause.has("missing_smoke_gate")) {
    actions.push({
      priority: "P0",
      title: "Create cross-platform smoke validation",
      rationale: "Release cannot progress without executable smoke/e2e coverage.",
      evidence: diagnostics.filter((line) => /smoke|e2e/i.test(line)).slice(0, 4)
    });
  }
  if (byCause.has("provider_cli_command_length_overflow")) {
    actions.push({
      priority: "P1",
      title: "Enforce compact provider prompt budget",
      rationale: "Command-length overflow causes silent repair loop failures in Windows environments.",
      evidence: diagnostics.filter((line) => /too long|demasiado larga/i.test(line)).slice(0, 4)
    });
  }
  if (byCause.has("provider_non_contractual_output")) {
    actions.push({
      priority: "P1",
      title: "Force strict JSON file contract for provider responses",
      rationale: "Non-contractual responses prevent deterministic file patching.",
      evidence: diagnostics.filter((line) => /provider|valid files|ready for your command|empty output/i.test(line)).slice(0, 4)
    });
  }
  if (byCause.has("provider_quota_or_capacity")) {
    actions.push({
      priority: "P1",
      title: "Apply provider backoff and model rotation",
      rationale: "Quota/capacity throttling requires controlled retries to avoid dead cycles.",
      evidence: diagnostics.filter((line) => /quota|capacity|429|terminalquotaerror/i.test(line)).slice(0, 4)
    });
  }
  if (byCause.has("documentation_quality_gap")) {
    actions.push({
      priority: "P2",
      title: "Harden product documentation baseline",
      rationale: "Incomplete README/mission artifacts reduce release readiness and maintainability.",
      evidence: diagnostics.filter((line) => /readme|mission|placeholder/i.test(line)).slice(0, 4)
    });
  }
  if (actions.length === 0 && diagnostics.length > 0) {
    actions.push({
      priority: "P1",
      title: "Resolve unresolved lifecycle blockers",
      rationale: "Quality gates are failing but no known pattern was matched.",
      evidence: diagnostics.slice(0, 4)
    });
  }
  return actions.slice(0, 10);
}

export function writeAutonomousFeedbackReport(params: {
  appDir: string;
  phase: string;
  diagnostics: string[];
}): AutonomousFeedbackReport {
  const diagnostics = params.diagnostics.map((line) => String(line || "").trim()).filter(Boolean);
  const rootCauses = detectRootCauses(diagnostics);
  const actions = buildActions(diagnostics, rootCauses);
  const summary =
    actions.length > 0
      ? `autonomous feedback generated with ${actions.length} prioritized action(s)`
      : "autonomous feedback generated with no actionable items";
  const report: AutonomousFeedbackReport = {
    at: new Date().toISOString(),
    phase: params.phase,
    diagnosticsCount: diagnostics.length,
    rootCauses,
    actions,
    summary
  };
  const deployDir = path.join(params.appDir, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  fs.writeFileSync(path.join(deployDir, "autonomous-feedback-report.json"), JSON.stringify(report, null, 2), "utf-8");
  const lines = [
    "# Autonomous Feedback Report",
    "",
    `- at: ${report.at}`,
    `- phase: ${report.phase}`,
    `- diagnosticsCount: ${report.diagnosticsCount}`,
    `- summary: ${report.summary}`,
    "",
    "## Root Causes",
    ...(report.rootCauses.length > 0 ? report.rootCauses.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Prioritized Actions",
    ...(report.actions.length > 0
      ? report.actions.map(
          (action) =>
            `- ${action.priority}: ${action.title}\n  rationale: ${action.rationale}\n  evidence: ${
              action.evidence.length > 0 ? action.evidence.join(" | ") : "n/a"
            }`
        )
      : ["- none"])
  ];
  fs.writeFileSync(path.join(deployDir, "autonomous-feedback-report.md"), `${lines.join("\n")}\n`, "utf-8");
  return report;
}
