# Value Backlog (Community + Product)

This backlog is the current source of truth for high-value improvements after Milestones M1-M6.
Priority is driven by adoption, reliability, and contributor experience.

## Prioritization model
- Impact: expected KPI movement (activation, retention, release safety, contributor throughput)
- Effort: estimated implementation complexity and maintenance cost
- Priority score: High impact + low/medium effort first

## P0 (Next 2-4 weeks)

### 1) Error code coverage completion (`SDD-xxxx`)
- Status: In progress (core + PR + gen + learn covered; remaining edge commands pending)
- Why it matters:
  - Makes failures deterministic for users and CI.
  - Reduces support turnaround time.
- Scope:
  - Extend machine-readable errors to all remaining edge command groups (`ai-*`, `list`, `route`, `req-*` utilities).
  - Add a central error code catalog doc with ownership and remediation hints.
  - Add CI check to detect plain-text error regressions in key commands and expand monitored list incrementally.
- KPI linkage:
  - Lower support friction.
  - Higher CI integration confidence.

### 2) Release confidence hardening
- Status: In progress
- Why it matters:
  - Release quality directly impacts trust and retention.
- Scope:
  - Add workflow test coverage for release scripts (`release:notes`, `release:changelog`, `verify:publish`).
  - Add dry-run validation for GitHub release workflow inputs.
  - Add release artifact retention policy and naming convention docs.
- KPI linkage:
  - Faster, safer release cadence.
  - Fewer release rollbacks.

### 3) First-run activation telemetry scaffold (privacy-safe)
- Status: In progress
- Why it matters:
  - Current KPIs are defined but weakly instrumented.
- Scope:
  - Add optional local metrics snapshots (`ttfv`, command funnel markers) in workspace metadata.
  - Provide explicit opt-in/opt-out flags.
  - Add script to summarize anonymized local adoption trends.
- KPI linkage:
  - Measurable TTFV and funnel drop-off improvements.

## P1 (Next 1-2 months)

### 4) Monorepo scale UX
- Status: In progress
- Why it matters:
  - `--scope` exists; teams need richer scope ergonomics.
- Scope:
  - Add `scope list` and `scope status`.
  - Add scope-aware recommendations in `status --next`.
  - Add docs with multi-scope examples for platform teams.

### 5) PR review intelligence improvements
- Status: In progress
- Why it matters:
  - PR workflows are a major adoption channel.
- Scope:
  - Add structured PR comment severity rollup.
  - Add unresolved-risk summary artifact for release gates.
  - Add bridge integrity check to ensure PR links remain valid.

### 6) Doctor remediation expansion
- Status: In progress
- Why it matters:
  - `doctor --fix` currently handles a narrow set of remediations.
- Scope:
  - Repair missing JSON skeletons for known artifact types.
  - Auto-rebuild missing requirement folder layout by status.
  - Emit fix report artifact with before/after summary.

## P2 (Community + Ecosystem)

### 7) Contributor onboarding pack
- Status: In progress
- Scope:
  - [x] Add `docs/CONTRIBUTOR_QUICKSTART.md` with 15-minute setup and first contribution flow.
  - [x] Add script shortcuts for common dev tasks (`npm run dev:smoke`, `npm run dev:release-check`).
  - [x] Add issue labels taxonomy and triage playbook.

### 8) Integration adapters roadmap
- Status: Planned
- Scope:
  - Define adapter contract for trackers (Linear, Azure Boards, GitLab issues).
  - Add one additional importer to validate architecture.

### 9) Templates quality uplift
- Status: Planned
- Scope:
  - Add template quality lint for placeholders and section completeness.
  - Add golden snapshot tests for top template families.

## Next sprint proposal (ready to execute)
- [ ] Complete `SDD-xxxx` rollout to remaining edge commands (`ai-*`, `list`, `route`, `req-*` utility commands).
- [ ] Add tests for `doctor --fix` rollback/idempotency behavior.
- [ ] Add release script coverage for `release:notes` and `verify:publish` failure branches.
- [ ] Add `scope status --next` recommendation mode.

## Detailed P0/P1 execution backlog

### P0-A: Complete deterministic error handling
- Objective: 100% user-facing failure paths produce `SDD-xxxx`.
- Tasks:
  - Assign code ranges for `ai` and utility commands and document in `docs/ERROR_CODES.md`.
  - Replace remaining raw error logs with `printError(...)`.
  - Expand `scripts/check-error-codes.js` monitored files for each migrated command.
  - Add focused tests that assert code emission for representative failures.
- Done when:
  - `check:error-codes` passes with expanded coverage.
  - No raw high-signal failure logs remain in migrated command families.

### P0-B: Release confidence hardening
- Objective: zero-surprise release pipeline.
- Tasks:
  - Add tests for `release:notes` generation edge cases (no commits, malformed commits, mixed scopes).
  - Add failure-case tests for `verify:publish` and release-tag guards.
  - Add docs for release artifact naming and retention policy.
- Done when:
  - Release scripts have green-path and failure-path tests.
  - Docs describe exact recovery actions per release guardrail error.

### P1-A: Scope UX and decision support
- Objective: make scoped workflows the default for monorepos.
- Tasks:
  - Add `status --next --scope <name>` examples to docs and onboarding transcript.
  - Add scope-aware quickstart helpers and actionable next-step hints.
  - Add tests for empty-scope and multi-project scope edge cases.
- Done when:
  - A new user in a scoped workspace can complete first value flow without guessing commands.

### P1-B: PR quality gates
- Objective: improve trust in PR-to-requirement traceability.
- Tasks:
  - Enrich `pr risk` with unresolved critical item counters and change trend deltas.
  - Add `pr bridge-check` output fields for missing requirement artifacts and stale links.
  - Add docs for integrating bridge/risk outputs into CI gate jobs.
- Done when:
  - Teams can gate merge decisions using generated artifacts without manual triage.

## Out of scope (for now)
- Cloud-hosted telemetry backend.
- Full GUI dashboard.
- Multi-tenant remote state management.
