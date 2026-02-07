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
- [ ] Add `status --next` recommendation command.
- [ ] Publish "first 15 minutes" walkthrough and transcript.

### Success criteria

- New users can complete a done requirement in under 5 minutes.
- Lower drop-off between first command and first completed requirement.

## Phase 2: Integration (Days 31-60)

### Objectives

- Make `sdd-cli` fit into existing team workflows.

### Work items

- [ ] Import from GitHub Issue URL.
- [ ] Import from Jira ticket.
- [ ] Link PR review outputs back into requirement artifacts.
- [ ] Add monorepo scope support.

### Success criteria

- Teams can bootstrap a requirement from existing work items.
- Adoption grows in CI and PR pipelines.

## Phase 3: Reliability and scale (Days 61-90)

### Objectives

- Improve trust with deterministic operations and clear diagnostics.

### Work items

- [ ] Add machine-readable error codes (`SDD-xxxx`).
- [ ] Add `doctor --fix` for common remediations.
- [ ] Auto-generate release notes from conventional commits.
- [ ] Generate release quality summary (tests, docs check, smoke check).

### Success criteria

- Common failures are easy to diagnose and recover from.
- Releases become repeatable with standardized notes and validation.
