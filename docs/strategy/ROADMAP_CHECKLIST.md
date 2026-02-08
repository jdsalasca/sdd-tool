# Roadmap Checklist

This roadmap tracks repo-level improvements aligned to the mission:
turn user intent into reliable, auditable outcomes with minimal friction.

## Milestone M1 - Product Truth and Onboarding Clarity

- [x] Align `README.md`, `docs/PROCESS.md`, and `docs/COMMANDS.md` with real default behavior.
- [x] Document default `hello` autopilot flow and manual `--questions` flow.
- [x] Add a beginner quickstart with one end-to-end example.
- [x] Add "what to run next" guidance for recovery after partial failures.

Acceptance criteria:
- Docs match current CLI behavior and flags.
- A new user can run one command and understand each step.

## Milestone M2 - Execution Reliability and Recovery

- [x] Add step checkpointing to resume autopilot from last successful stage.
- [x] Add `--from-step` execution support for targeted recovery.
- [x] Add workspace index locking for concurrent writes.
- [x] Add machine-readable error codes for common failures.

Acceptance criteria:
- Interrupted runs can resume without restarting from scratch.
- Common operational failures are deterministic and diagnosable.

## Milestone M3 - Automation and CI Hardening

- [x] Add `--non-interactive` mode for CI/script usage.
- [x] Add `--dry-run` mode for safe previews.
- [x] Add CI coverage for full autopilot integration tests (Windows + Linux).
- [x] Add docs-vs-code consistency checks in CI.

Acceptance criteria:
- Pipeline is script-friendly and testable in CI.
- Behavior and docs stay synchronized over time.

## Milestone M4 - Release Operations and Visibility

- [x] Generate release notes from conventional commits.
- [x] Publish GitHub Releases with structured highlights and migration notes.
- [x] Expand changelog automation for npm releases.
- [x] Track post-release quality metrics (tests, package integrity, docs drift).
- [x] Add npm publish workflow with release-tag validation and pre-publish checks.

Acceptance criteria:
- Every release has reproducible notes and validated artifacts.
- Consumers can quickly understand what changed and how to adopt it.

## Milestone M5 - Adoption and Workflow Embed

- [x] Add `quickstart` command for one-command first success.
- [x] Add an execution tracker (`AGENTS.md`) for adoption workstream.
- [x] Add a 90-day adoption roadmap in docs.
- [x] Add beginner mode (`--beginner`) for richer guided narration.
- [x] Add `status --next` recommendation command.
- [x] Add first-run onboarding transcript and walkthrough docs.

Acceptance criteria:
- New users can reach first successful done requirement with minimal friction.
- Adoption work is tracked visibly with milestones and measurable KPIs.

## Milestone M6 - Workflow Integration

- [x] Add GitHub issue import bootstrap (`import issue <url>`).
- [x] Add Jira import bootstrap (`import jira <ticket>`).
- [x] Add PR review bridge into requirement artifacts.
- [x] Add monorepo scope targeting (`--scope`).

Acceptance criteria:
- Existing work items can be imported directly into SDD flow.
- Teams can adopt SDD without replacing current tracker systems.

## Milestone M7 - Quality Standardization and Scale

- [x] Complete `SDD-xxxx` error code rollout for all command families.
- [x] Publish `docs/ERROR_CODES.md` with remediation playbooks.
- [x] Add release automation script test coverage.
- [x] Add scope-aware command recommendations and multi-scope status views.
- [x] Expand deterministic error handling coverage across `gen`, `learn`, `ai`, and `req` utility workflows.
- [x] Add failure-path tests for release and command error-code enforcement.

Acceptance criteria:
- Core and edge command failures are deterministic and actionable.
- Contributors can ship and troubleshoot releases with low cognitive overhead.
