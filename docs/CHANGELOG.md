# Changelog

## Unreleased
- Harden quality orchestration in `hello`:
  - default `--iterations` changed to `2`.
  - enforce minimum quality rounds + approval streak before acceptance.
  - allow bounded automatic extra rounds when quality remains below threshold.
- Expand digital reviewer coverage:
  - domain-specific quality checks for humanities, learning, and design.
  - stronger Java+React reviewer checks (DTO, records, interfaces, validation, advice, StrictMode).
  - telemetry evidence requirement for API/backend-like goals.
- Add provider execution timeout controls to avoid hanging runs:
  - `SDD_AI_EXEC_TIMEOUT_MS` (default `180000`).
  - `SDD_AI_VERSION_TIMEOUT_MS` (default `15000`).
- Improve AI response parsing robustness in autopilot:
  - accept alternative JSON shapes for generated file payloads (`artifacts`, `changes`, nested `result/data` wrappers).
  - recover file payloads from markdown `FILE: path` fenced blocks when strict JSON extraction fails.
- Raise production delivery baseline:
  - prompts now enforce English-only outputs, production-ready quality (no POC/first-draft), modular component blocks, and MVC-by-default architecture.
  - lifecycle quality now requires `components.md` and MVC-oriented architecture evidence for software/generic flows.
  - improved Spanish-to-English intent token normalization for naming and alignment checks.
  - repo naming is more market-descriptive by default (platform-oriented instead of generic `-app`).
- Add lifecycle preflight hardening before expensive quality runs:
  - detect nested duplicated app roots (`generated-app/generated-app`).
  - detect shell-only smoke scripts and require cross-platform npm/node commands.
  - detect import/dependency mismatches for common runtime/test modules (`supertest`, `axios`, `knex`, `ts-jest`).
  - detect TypeScript Jest preset/dependency inconsistencies earlier.
- Tighten final delivery acceptance and anti-mock quality guardrails:
  - enforce a final lifecycle verification pass after digital-review approval and before publish.
  - digital reviewers now require lifecycle evidence (`deploy/lifecycle-report.md`) with successful test/build/smoke checks and no FAIL entries.
  - reject README content that positions delivery as POC/prototype/placeholder instead of production-ready output.
  - require software/generic package-based projects to provide smoke/e2e npm scripts.
- Add runtime budget + learning telemetry for long autopilot runs:
  - new `--max-runtime-minutes <1..720>` global flag for `hello`/`suite`.
  - on timeout, `hello` stores checkpoint state and prints an explicit resume command.
  - persist per-round improvement metrics to `generated-app/deploy/iteration-metrics.json`.
  - emit opt-in local telemetry events for review/repair/lifecycle/publish iteration phases.
- Add release/runtime orchestration controls for generated apps:
  - managed release candidates per quality iteration and final production release support.
  - new config keys: `git.release_management_enabled` and `git.run_after_finalize`.
  - optional runtime auto-start writes process metadata to `generated-app/deploy/runtime-processes.json`.
- Improve Gemini file normalization and quality-repair prompting:
  - flatten accidental single nested project root inside `generated-app` responses.
  - stronger constraints/hints for TypeScript/Jest consistency, valid dependency versions, and contract-domain relational schemas.
- Add explicit stage-state enforcement in hello orchestration:
  - persistent stage machine file (`.sdd-stage-state.json`) tracks discovery -> requirements -> backlog -> implementation -> quality -> review -> release -> runtime.
  - block invalid stage transitions with machine-readable errors (`SDD-1013`, `SDD-1014`).
  - record pass/fail outcomes for quality validation, role review, release candidate/final release, and runtime start.

## 0.1.32
- Release notes: `docs/releases/v0.1.32.md`
- Release metrics: _pending_
- Tighten lifecycle quality gates with runtime expectations:
  - minimum 8 automated tests at lifecycle gate level.
  - required smoke script for API-like apps (`smoke` / `test:smoke` / `e2e`).
  - required curl/local endpoint verification evidence for API-like apps.
- Strengthen digital reviewers:
  - minimum 10 tests expectation for reviewer acceptance.
  - smoke verification required as a high-severity QA check.
- Add value-growth iteration behavior:
  - when base quality passes early, remaining `--iterations` rounds still push value stories and re-validate.

## 0.1.31
- Release notes: `docs/releases/v0.1.31.md`
- Release metrics: _pending_
- Add global `--iterations <1..10>` flag to control repeated review->story->implementation rounds in `hello`.
- Add strict `SDD-1005` validation for invalid iterations input.
- Expand digital review loop to run multiple rounds, each with quality revalidation and publish path.
- Persist per-round review history to `deploy/digital-review-rounds.json`.

## 0.1.30
- Release notes: `docs/releases/v0.1.30.md`
- Release metrics: _pending_
- Add expanded multi-role digital reviewer coverage (PM, QA, UX, accessibility, performance, support, integrator, release manager, security).
- Add automatic conversion of reviewer findings into prioritized user stories (`P0`/`P1`) for implementation loops.
- Add machine-readable and markdown user-story backlog artifacts in generated projects:
- `deploy/digital-review-user-stories.json`
- `deploy/digital-review-user-stories.md`
- Update `hello` digital-review loop to feed user stories back into Gemini refinement prompts.

## 0.1.29
- Release notes: `docs/releases/v0.1.29.md`
- Release metrics: _pending_
- Add stricter digital-review scoring with configurable threshold (`SDD_DIGITAL_REVIEW_MIN_SCORE`, default 85).
- Add production-readiness checks in digital reviewers for architecture/runbook docs and license presence.
- Add machine-readable delivery report `deploy/digital-review-report.json` to generated projects.
- Integrate digital-review reporting and scoring feedback into hello repair loop logs.

## 0.1.28
- Release notes: `docs/releases/v0.1.28.md`
- Release metrics: _pending_
- Add domain-aware quality gates beyond software for legal, business, humanities, learning, design, and data-science flows.
- Add stricter AI orchestration constraints so Gemini output must include domain-required artifacts before acceptance.
- Add domain-aware repair-loop prompts to push targeted corrective iterations instead of generic retries.
- Add digital human reviewers (PM, QA, UX, security/compliance) with automatic refinement loop before accepting delivery.
- Add domain quality profiles to generated `quality.json` from `req start`.
- Extend route prompt-pack mapping with domain quality packs.
- Add lifecycle tests that enforce legal and data-science artifact quality requirements.

## 0.1.27
- Release notes: `docs/releases/v0.1.27.md`
- Add deeper architecture quality gates for Java+React generations:
  - DTO layer and `*Dto.java` enforcement.
  - service/repository interface enforcement.
  - Java `record` usage enforcement.
  - global exception handling via `@RestControllerAdvice`.
  - validation usage enforcement with `jakarta/javax.validation` annotations and `@Valid`.
  - backend production dependencies enforcement (`lombok`, `spring-boot-starter-validation`, `spring-boot-starter-actuator`).
  - backend telemetry configuration enforcement (actuator/prometheus settings).
  - frontend architecture enforcement (`src/api`, `src/hooks/use*`, `src/components`, React StrictMode).
  - frontend modern dependency and test baseline enforcement.
- Improve repo metadata naming to prioritize user intent terms for more descriptive GitHub repository names.
- Improve lifecycle robustness in Windows and process diagnostics handling for failed checks.

## 0.1.26
- Release notes: `docs/releases/v0.1.26.md`
- Add strict Java+React architecture gates for generated apps:
  - required DTO layer, service/repository interfaces, and Java `record` usage.
  - required frontend layering (`src/api`, `src/hooks/use*`, `src/components`).
  - required minimum frontend test evidence for Java+React profile.
- Strengthen relational-domain checks with SQL schema enforcement (`schema.sql`/migrations) and explicit DB technology declaration.
- Improve lifecycle execution quality checks in multi-module projects (`backend` and `frontend`), including better Windows Maven command resolution.
- Improve AI repair loop robustness with compact diagnostics and minimal-patch fallback prompts.

## 0.1.25
- Release notes: `docs/releases/v0.1.25.md`
- Restructure strategic product material under `docs/strategy/` for clearer documentation ownership and navigation.
- Add market positioning playbook (`docs/strategy/MARKET_POSITIONING.md`) with ICP, messaging, differentiation, and GTM focus.
- Keep npm-facing README concise and outcome-focused while preserving deep material under `docs/`.
- Enable npm publish workflow trigger on tag push (`v*`) in addition to release/manual dispatch.

## 0.1.24
- Release notes: `docs/releases/v0.1.24.md`
- Strengthen strict orchestrator behavior so generated apps are validated against user intent before acceptance/publish.
- Improve GitHub repo metadata derivation to prioritize project goal/context instead of AI-generated README titles.
- Add lifecycle quality diagnostics and retry controls to improve provider-driven recovery loops.
- Add configurable defaults (`ai.model`) and update docs for config-based workspace/provider setup.
- Refresh npm package description and README navigation to reduce documentation noise.

## 0.1.23
- Release notes: `docs/releases/v0.1.23.md`
- Release metrics: `docs/releases/v0.1.23-metrics.md`
- Add `sdd-cli import azure <work-item|url>` to bootstrap autopilot from Azure Boards items.
- Add deterministic Azure import error codes (`SDD-1131`, `SDD-1132`) with integration test coverage.
- Improve docs for import adapters, process entry points, and error-code remediation map.
- Clarify npm package description with usage-oriented value proposition in English.

## 0.1.22
- Release notes: `docs/releases/v0.1.22.md`
- Release metrics: `docs/releases/v0.1.22-metrics.md`
- Add contributor onboarding pack (`docs/CONTRIBUTOR_QUICKSTART.md`) and issue triage taxonomy (`docs/ISSUE_TRIAGE_PLAYBOOK.md`).
- Add contributor-focused dev shortcuts: `npm run dev:smoke` and `npm run dev:release-check`.
- Add integration adapters contract and rollout guide in `docs/INTEGRATION_ADAPTERS.md` (Linear/Azure/GitLab).
- Add `sdd-cli import linear <ticket|url>` with deterministic errors and integration test coverage.

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
