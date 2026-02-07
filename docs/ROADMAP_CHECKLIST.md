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
- [ ] Add workspace index locking for concurrent writes.
- [ ] Add machine-readable error codes for common failures.

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

- [ ] Generate release notes from conventional commits.
- [ ] Publish GitHub Releases with structured highlights and migration notes.
- [ ] Expand changelog automation for npm releases.
- [ ] Track post-release quality metrics (tests, package integrity, docs drift).

Acceptance criteria:
- Every release has reproducible notes and validated artifacts.
- Consumers can quickly understand what changed and how to adopt it.

## Milestone M5 - Adoption and Workflow Embed

- [x] Add `quickstart` command for one-command first success.
- [x] Add an execution tracker (`AGENTS.md`) for adoption workstream.
- [x] Add a 90-day adoption roadmap in docs.
- [x] Add beginner mode (`--beginner`) for richer guided narration.
- [x] Add `status --next` recommendation command.

Acceptance criteria:
- New users can reach first successful done requirement with minimal friction.
- Adoption work is tracked visibly with milestones and measurable KPIs.
