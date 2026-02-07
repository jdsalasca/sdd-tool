# AGENTS Execution Tracker

This file tracks adoption-focused execution work for `sdd-cli`.

## North Star

- Increase activation and retention by making `sdd-cli` the default way teams start and run scoped delivery workflows.

## Adoption KPIs

- Time-to-First-Value (TTFV) under 5 minutes.
- `hello -> finish` completion rate.
- Week-4 retention for active projects.
- CI integration adoption rate (`check:docs`, smoke, e2e).

## 90-Day Roadmap Status

### Phase 1 (Days 1-30): Activation and onboarding

- [x] Add `quickstart` command for one-command demo.
- [x] Add beginner mode (`--beginner`) with extra guided narration.
- [x] Add `status --next` command to recommend exact next command.
- [x] Add first-run onboarding transcript/gif in docs.

### Phase 2 (Days 31-60): Workflow integration

- [x] Add issue import command (`import issue <url>`).
- [x] Add Jira ticket import command (`import jira <ticket>`).
- [x] Add PR review bridge from existing PR commands to SDD artifacts.
- [x] Add monorepo scope targeting (`--scope`).

### Phase 3 (Days 61-90): Reliability and scale

- [ ] Add machine-readable error codes (`SDD-xxxx`) for common failures.
- [ ] Add `doctor --fix` auto-remediation for common workspace issues.
- [x] Add release notes generation from conventional commits.
- [ ] Add post-release metrics summary script.

## Current Milestone

- Milestone: `integration-import-workitems`
- Branch: `feature/import-issue-bootstrap`
- Goal: bootstrap SDD autopilot from existing GitHub issue and Jira work items.
