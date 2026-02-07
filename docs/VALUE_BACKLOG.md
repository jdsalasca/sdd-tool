# Value Backlog (Community + Product)

This backlog is the current source of truth for high-value improvements after Milestones M1-M6.
Priority is driven by adoption, reliability, and contributor experience.

## Prioritization model
- Impact: expected KPI movement (activation, retention, release safety, contributor throughput)
- Effort: estimated implementation complexity and maintenance cost
- Priority score: High impact + low/medium effort first

## P0 (Next 2-4 weeks)

### 1) Error code coverage completion (`SDD-xxxx`)
- Status: In progress (core + PR workflows largely covered)
- Why it matters:
  - Makes failures deterministic for users and CI.
  - Reduces support turnaround time.
- Scope:
  - Extend machine-readable errors to all remaining command groups (`gen/*`, `learn/*`, `pr-*`, remaining `req-*`).
  - Add a central error code catalog doc with ownership and remediation hints.
  - Add CI check to detect plain-text error regressions in key commands.
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
- Status: Planned
- Scope:
  - Add `docs/CONTRIBUTOR_QUICKSTART.md` with 15-minute setup and first contribution flow.
  - Add script shortcuts for common dev tasks (`npm run dev:smoke`, `npm run dev:release-check`).
  - Add issue labels taxonomy and triage playbook.

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
- [ ] Complete `SDD-xxxx` rollout to remaining command families.
- [ ] Add `docs/ERROR_CODES.md` with remediation guidance.
- [ ] Add script tests for release automation suite.
- [ ] Add scope-aware `status --next` suggestions.

## Out of scope (for now)
- Cloud-hosted telemetry backend.
- Full GUI dashboard.
- Multi-tenant remote state management.
