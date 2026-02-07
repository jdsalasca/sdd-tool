# Adoption Roadmap (90 Days)

This roadmap focuses on one goal:
make `sdd-cli` easy to adopt, easy to trust, and easy to keep in daily workflows.

## Outcomes

- Faster activation for new users.
- Better integration with real delivery systems (issues, PRs, CI).
- Higher confidence through deterministic flows and diagnosable failures.

## Phase 1: Activation (Days 1-30)

### Objectives

- Reduce friction to first successful end-to-end run.
- Make beginner onboarding obvious and repeatable.

### Work items

- [x] Add `sdd-cli quickstart` with built-in examples.
- [x] Add beginner mode (`--beginner`) with richer guidance.
- [x] Add `status --next` recommendation command.
- [x] Publish "first 15 minutes" walkthrough and transcript.

### Success criteria

- New users can complete a done requirement in under 5 minutes.
- Lower drop-off between first command and first completed requirement.

## Phase 2: Integration (Days 31-60)

### Objectives

- Make `sdd-cli` fit into existing team workflows.

### Work items

- [x] Import from GitHub Issue URL.
- [x] Import from Jira ticket.
- [x] Link PR review outputs back into requirement artifacts.
- [x] Add monorepo scope support.

### Success criteria

- Teams can bootstrap a requirement from existing work items.
- Adoption grows in CI and PR pipelines.

## Phase 3: Reliability and scale (Days 61-90)

### Objectives

- Improve trust with deterministic operations and clear diagnostics.

### Work items

- [x] Add machine-readable error codes (`SDD-xxxx`).
- [x] Add `doctor --fix` for common remediations.
- [x] Auto-generate release notes from conventional commits.
- [x] Generate release quality summary (tests, docs check, smoke check).

### Success criteria

- Common failures are easy to diagnose and recover from.
- Releases become repeatable with standardized notes and validation.

## Phase 4: Scale and community (Post-90 days)

### Objectives

- Sustain adoption with contributor-friendly operations.
- Improve observability for product decisions without sacrificing simplicity.

### Work items

- [ ] Complete full `SDD-xxxx` error-code coverage for all commands.
- [ ] Publish a centralized `ERROR_CODES` remediation guide.
- [ ] Expand scope-aware workflows for large monorepos.
- [ ] Add release automation test suite and artifact quality checks.
- [ ] Publish contributor quickstart and triage playbook.

### Success criteria

- Faster issue triage with lower support overhead.
- Higher contribution throughput and safer release cadence.
