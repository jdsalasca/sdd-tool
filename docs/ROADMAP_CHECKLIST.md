# Roadmap Checklist

This roadmap tracks repo-level improvements aligned to the mission:
turn user intent into reliable, auditable outcomes with minimal friction.

## Milestone M1 - Product Truth and Onboarding Clarity

- [ ] Align `README.md`, `docs/PROCESS.md`, and `docs/COMMANDS.md` with real default behavior.
- [ ] Document default `hello` autopilot flow and manual `--questions` flow.
- [ ] Add a beginner quickstart with one end-to-end example.
- [ ] Add "what to run next" guidance for recovery after partial failures.

Acceptance criteria:
- Docs match current CLI behavior and flags.
- A new user can run one command and understand each step.

## Milestone M2 - Execution Reliability and Recovery

- [ ] Add step checkpointing to resume autopilot from last successful stage.
- [ ] Add `--from-step` execution support for targeted recovery.
- [ ] Add workspace index locking for concurrent writes.
- [ ] Add machine-readable error codes for common failures.

Acceptance criteria:
- Interrupted runs can resume without restarting from scratch.
- Common operational failures are deterministic and diagnosable.

## Milestone M3 - Automation and CI Hardening

- [ ] Add `--non-interactive` mode for CI/script usage.
- [ ] Add `--dry-run` mode for safe previews.
- [ ] Add CI coverage for full autopilot integration tests (Windows + Linux).
- [ ] Add docs-vs-code consistency checks in CI.

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
