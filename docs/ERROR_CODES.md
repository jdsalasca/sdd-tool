# Error Codes (`SDD-xxxx`)

This document defines machine-readable error code ranges and remediation guidance.

## Ranges
- `SDD-1000..1099`: hello/autopilot onboarding and resume flow
- `SDD-1100..1199`: import commands (`import issue`, `import jira`)
- `SDD-1200..1299`: requirement lifecycle (`req *`)
- `SDD-1300..1399`: PR review workflow (`pr *`)
- `SDD-1400..1499`: scope and monorepo workspace commands
- `SDD-1500..1599`: AI/provider and utility command failures
- `SDD-1600..1699`: artifact generation commands (`gen *`)
- `SDD-1700..1799`: learning workflow commands (`learn *`)
- `SDD-2000..2099`: doctor validation/remediation
- `SDD-3000..3099`: release and publish guardrails

## Quick remediation map
- `SDD-1101`: Invalid GitHub issue URL
  - Fix: provide `https://github.com/<owner>/<repo>/issues/<number>`.
- `SDD-1111`: Invalid Jira ticket
  - Fix: provide `PROJ-123` or `https://<site>/browse/PROJ-123`.
- `SDD-1004`: Resume requested without checkpoint
  - Fix: run from `--from-step create` first, or execute full autopilot once to create checkpoint state.
- `SDD-1211`: Missing project/requirement input for planning
  - Fix: pass `--project` and requirement ID when prompted.
- `SDD-1236`: `req finish` failed after move sequence
  - Fix: inspect reported error, rerun with same `REQ-*`; rollback is automatic.
- `SDD-1315`: PR review directory missing
  - Fix: run `sdd-cli pr start` first, then retry.
- `SDD-1249`: Requirement not found for lint run
  - Fix: verify `REQ-*` exists with `sdd-cli req list`, then rerun lint.
- `SDD-1503`: Codex provider unavailable
  - Fix: install/configure Codex provider and validate with `sdd-cli ai status`.
- `SDD-2006`: Artifact schema validation failed
  - Fix: run `sdd-cli doctor --fix` then `req refine` or regenerate affected artifact.
- `SDD-1614`: Functional spec validation failed
  - Fix: update prompted fields to match schema requirements and rerun `sdd-cli gen functional-spec`.
- `SDD-1725`: Learning session not found
  - Fix: run `sdd-cli learn refine` and select a valid session ID from the listed sessions.
- `SDD-3003`: Release tag/package version mismatch
  - Fix: align `package.json` version and tag (`vX.Y.Z`).

## Guidance for contributors
- Every new user-facing failure path should emit an `SDD-xxxx` code.
- Keep code references stable once published.
- Add/update tests when introducing new codes for core flows.
