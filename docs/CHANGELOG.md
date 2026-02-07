# Changelog

## Unreleased
- None.

## 0.1.21
- Release notes: _pending_
- Release metrics: `docs/releases/v0.1.21-metrics.md`
- Mark Milestone M7 complete with deterministic `SDD-xxxx` error coverage and enforcement across command families.
- Add deterministic error handling for `hello --questions` prompt-pack load failures (`SDD-1012`).

## 0.1.20
- Release notes: `docs/releases/v0.1.20.md`
- Release metrics: `docs/releases/v0.1.20-metrics.md`
- Add `sdd-cli import jira <ticket|browse-url>` to bootstrap autopilot from Jira work items.
- Add monorepo scope targeting with global `--scope <name>` workspace namespacing.
- Add `sdd-cli pr bridge` to link PR review outputs back into requirement artifacts.
- Add release notes automation via `npm run release:notes` and generated milestone notes.
- Add machine-readable doctor diagnostics with `SDD-xxxx` error codes and non-zero exit behavior.
- Add `sdd-cli doctor --fix` for safe remediation of missing requirement operation logs.
- Add release quality summary automation via `npm run release:metrics`.
- Add workspace index locking with stale lock recovery for concurrent write safety.
- Add GitHub Release workflow automation for tagged versions with generated notes and attached metrics.
- Add changelog promotion automation for npm releases via `npm run release:changelog`.
- Add npm publish workflow with tag/version guardrails and pre-publish bundle verification.
- Add publish-readiness CI workflow for PR/push dry-run npm bundle validation.
- Add release PR template and npm publish troubleshooting guide.
- Standardize `SDD-xxxx` error codes across core `import`, `req`, and `pr` command failure paths.
- Add `scope list`/`scope status` commands and scope-aware recommendations in `status --next`.
- Add local opt-in telemetry snapshots (`--metrics-local`) for activation and command usage markers.
- Add `pr risk` severity rollup and `pr bridge-check` integrity verification artifacts.
- Expand `doctor --fix` with requirements layout repair, JSON skeleton remediations, and fix reports.
- Add error-code catalog (`docs/ERROR_CODES.md`) and CI checks for monitored core command error paths.
- Extend `SDD-xxxx` error coverage to `gen`, `learn`, `ai`, and requirement utility commands (`req archive/export/lint/list/status/report/refine`, `test-plan`).
- Expand `check:error-codes` monitoring list to enforce new command-family coverage in CI.
- Harden release notes generation with machine-readable failure codes for invalid git ranges (`SDD-3005`) and write failures (`SDD-3006`).
- Add release-script failure-path tests for `verify-publish-ready` and `generate-release-notes`.
- Add `SDD-100x` hello/autopilot onboarding errors for invalid resume/input scenarios.
- Add `SDD-1411` scope-status validation error and monitor `status`/`scope-status` in `check:error-codes` coverage.
- Add integration tests for new error-code paths (`hello --from-step` invalid, `scope status` missing scope).
- Add deterministic scope/status edge errors (`SDD-1402`, `SDD-1412`) with integration test coverage.
- Add deterministic list/route failure handling (`SDD-1421`, `SDD-1424`) and include both commands in error-code enforcement checks.
- Add `SDD-1011` quickstart invalid-example handling and enforce `quickstart`/`scope-list` in error-code checks.
- Add `SDD-1012` for `hello --questions` prompt-pack load failures with integration coverage.

## 0.1.6
- Standardize docs and reports layout under `docs/`.
- Add workspace, validation, and generation commands plus tests.
- Improve hello flow UX and prompt exit handling on Windows.
- Add troubleshooting guidance and install warnings for CLI shims.
