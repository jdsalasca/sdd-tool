# Error Codes (`SDD-xxxx`)

This document defines machine-readable error code ranges and remediation guidance.

## Ranges
- `SDD-1000..1099`: hello/autopilot onboarding and resume flow
- `SDD-1100..1199`: import commands (`import issue`, `import jira`, `import linear`, `import azure`)
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
- `SDD-1121`: Invalid Linear ticket
  - Fix: provide `LIN-123` or `https://linear.app/<team>/issue/LIN-123/<slug>`.
- `SDD-1131`: Invalid Azure work item
  - Fix: provide `AB#1234`, `1234`, or `https://dev.azure.com/<org>/<project>/_workitems/edit/1234`.
- `SDD-1132`: Azure work item fetch failed
  - Fix: verify `SDD_AZURE_API_BASE`/`SDD_AZURE_PAT` and ensure the work item exists and is accessible.
- `SDD-1004`: Resume requested without checkpoint
  - Fix: run from `--from-step create` first, or execute full autopilot once to create checkpoint state.
- `SDD-1005`: Invalid iterations value
  - Fix: use `--iterations` with an integer between `1` and `10`.
- `SDD-1006`: Invalid max runtime value or runtime budget exceeded
  - Fix (input): use `--max-runtime-minutes` with an integer between `1` and `720`.
  - Fix (timeout): rerun with a higher runtime budget or resume from the printed `--from-step` checkpoint command.
- `SDD-1013`: Stage transition blocked by delivery state machine
  - Fix: complete and pass all prerequisite stages before entering the target stage.
- `SDD-1014`: Project root mismatch during stage transition
  - Fix: rerun from `--from-step create` to rebuild a consistent delivery state for the project.
- `SDD-1011`: Invalid quickstart example
  - Fix: run `sdd-cli quickstart --list-examples` and pass one of the supported keys.
- `SDD-1012`: Hello questions mode could not load prompt packs
  - Fix: ensure `templates/prompt-pack-index.json` exists and is valid, then retry `hello --questions`.
- `SDD-1211`: Missing project/requirement input for planning
  - Fix: pass `--project` and requirement ID when prompted.
- `SDD-1236`: `req finish` failed after move sequence
  - Fix: inspect reported error, rerun with same `REQ-*`; rollback is automatic.
- `SDD-1315`: PR review directory missing
  - Fix: run `sdd-cli pr start` first, then retry.
- `SDD-1402`: Selected project not found in workspace
  - Fix: run `sdd-cli status` without `--project`, or choose a valid project name from workspace index.
- `SDD-1412`: No scopes available in workspace
  - Fix: initialize scoped work with `--scope <name>` on project commands, then rerun `sdd-cli scope list`.
- `SDD-1421`: Prompt pack index cannot be loaded
  - Fix: ensure `templates/prompt-pack-index.json` exists and is valid JSON.
- `SDD-1424`: Route context loading failed
  - Fix: verify router flow/template assets exist under repository root and retry.
- `SDD-1249`: Requirement not found for lint run
  - Fix: verify `REQ-*` exists with `sdd-cli req list`, then rerun lint.
- `SDD-1503`: Codex provider unavailable
  - Fix: install/configure Codex provider and validate with `sdd-cli ai status`.
- `SDD-1504`: Requested provider unavailable
  - Fix: install/configure requested provider (`gemini` or `codex`), or use `--provider auto`.
- `SDD-1505`: Provider execution failed
  - Fix: verify provider auth/session and retry with `sdd-cli ai exec`.
- `SDD-1506`: Invalid provider value
  - Fix: use one of `gemini`, `codex`, `auto`.
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
