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

- [x] Add machine-readable error codes (`SDD-xxxx`) for common failures.
- [x] Add `doctor --fix` auto-remediation for common workspace issues.
- [x] Add release notes generation from conventional commits.
- [x] Add post-release metrics summary script.

## Current Milestone

- Milestone: `p0-p1-execution-wave`
- Branch: `develop`
- Goal: execute P0/P1 backlog items with production-grade tests, docs, and release-safe rollout.

---

## Product Objective (Canonical)

`sdd-tool` must orchestrate end-to-end delivery using Gemini (default) so the user can run one command and obtain a production-ready outcome.

Command style:
- `sdd-tool "create X"`
- `sdd-tool suite`

Expected end state:
- Functional and usable application.
- Clear functional and technical requirements.
- Prioritized backlog implemented through iterations.
- Multi-role review feedback incorporated.
- Automated quality gates fully green (build/test/lint/smoke + runtime checks).
- Git repository updated, release candidates created during iteration, final release published.
- App running locally at completion (when enabled by config).

Non-goal:
- `sdd-tool` should not replace the AI model with hardcoded app-specific coding. It is an orchestrator and validator.

## Current Problem Statement (Root Causes)

1. Stage transitions are too permissive.
- Discovery/requirements/planning are not hard-blocking coding in all failure paths.

2. Output contract enforcement is incomplete.
- AI responses sometimes miss required artifacts or produce structurally invalid projects.

3. Quality gates are applied late.
- Some failures are detected only after expensive generation loops.

4. Role-review stage is not always authoritative.
- Findings are generated but not always transformed into strict blocking conditions for release progression.

5. Resume and timeout behavior can leave inconsistent phase continuity.
- Checkpoints can point to invalid continuation steps in edge cases.

## Mandatory Orchestration Stages

All runs must follow this sequence and cannot skip gates:

1. `DISCOVERY`
- Clarify objective, users, constraints, scope.

2. `FUNCTIONAL_REQUIREMENTS`
- Functional requirements, acceptance criteria, user journeys.

3. `TECHNICAL_BACKLOG`
- Architecture decisions, technical backlog, risk register, NFRs.

4. `IMPLEMENTATION`
- AI generates/updates code from approved backlog.

5. `QUALITY_VALIDATION`
- Build/test/lint/smoke/runtime checks and artifact checks.

6. `ROLE_REVIEW`
- Simulated human reviewers by role produce findings.
- Findings must become user stories and feed next iteration.

7. `RELEASE_CANDIDATE`
- Create release candidate only if gates are green.

8. `FINAL_RELEASE`
- Publish final release only if no blocking findings remain.
- Start runtime if configured.

## Hard Quality Gates (Blocking)

A delivery is rejected if any fail:
- Build fails.
- Tests fail or below minimum threshold.
- Smoke/e2e fails.
- Missing required docs/artifacts (`README`, `architecture`, `components`, `schemas`, `DummyLocal`, regression evidence).
- Domain-specific artifacts missing (e.g., legal compliance docs, relational schema).
- Lifecycle report includes FAIL entries.
- Critical reviewer findings unresolved.

## Multi-Role Review Requirement

The role-review stage must always include:
- Product Manager
- QA Engineer
- UX Researcher
- Accessibility Reviewer
- Security Reviewer
- SRE/Operations Reviewer
- End User Persona

Flow:
- Findings -> prioritized user stories (`P0`/`P1`) -> implementation -> quality validation -> re-review.

## Release Policy

- RC releases are allowed only after passing quality gates for that iteration.
- Final release requires:
  - green final lifecycle verification,
  - no blocking reviewer findings,
  - publish success when `git.publish_enabled=true`.

## Runtime Policy

- If `git.run_after_finalize=true`, app must be started at the end and runtime metadata persisted.
- Failure to start runtime is blocking for final acceptance.

## Test Protocol (How To Prove It Works)

Primary validation scenario:
1. Run:
   - `sdd-tool --provider gemini --iterations 3 --max-runtime-minutes 12 "create a contract management app with lawyers, clients, and costs"`
2. Verify:
   - Project generated under configured workspace root.
   - All stage artifacts exist.
   - Lifecycle report has no FAIL.
   - Digital review report passes.
   - RC releases recorded in release history.
   - Final release exists and repository is published.
   - Runtime process metadata exists and app is reachable locally.

## P0 Backlog (Immediate)

- [ ] Enforce explicit stage machine transitions with blocking validation at each stage.
- [ ] Make role-review findings strictly blocking for release progression.
- [ ] Harden timeout/resume continuity so checkpoint step is always valid.
- [ ] Add contract-profile prompt pack for recurring domains (contracts/legal/services).
- [ ] Add regression tests for stage transition integrity and release gating.

## Definition of Done (Strict)

A run is `DONE` only when:
- Functional app is usable.
- All quality gates pass.
- Role reviews pass required threshold.
- Final release is created/published (if enabled).
- Runtime starts successfully (if enabled).
- Artifacts and reports are complete and traceable.
