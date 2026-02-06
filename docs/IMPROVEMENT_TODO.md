# Improvement Todo

## P0 - Reliability and State Safety

- [x] Preserve runtime flags on partial updates (`setFlags` merge semantics).
- [x] Make `req finish` safer by validating before state transition and adding rollback on failure.
- [x] Fix requirement report/readme location mismatch (`project-readme.json` lives at project root).
- [x] Fail fast with clear message when a template name is missing.

## P1 - Workflow Robustness

- [x] Ensure `req refine` can create `changelog.md` when missing.
- [x] Keep `doctor` checks active for prompt packs/templates even without workspace artifacts.
- [x] Export requirement directories recursively (including `decision-log`).
- [x] Harden workspace JSON parsing against corrupted metadata/index files.

## P2 - Test Coverage

- [x] Add regression test for partial flag updates.
- [x] Add regression test for missing template errors.
- [x] Add integration tests for `req finish` rollback behavior.
- [x] Add integration tests for `req report` expected file layout.
- [x] Add integration tests for recursive export.

## P3 - Beginner Experience (Default Mode)

- [x] Add guided "Step 1/2/3" messaging in `hello`.
- [x] Add autopilot draft creation from a single user intent in default mode.
- [x] Reduce mandatory prompts in automated requirement creation with safe defaults.
- [ ] Add auto-orchestration from requirement draft to plan/start/test in one guided command.
- [ ] Add natural-language progress narration during long generation steps.

## Release Checklist

- [x] Create feature branches by scope.
- [x] Use Conventional Commits in every commit.
- [x] Open PRs to `develop` and merge after green CI.
- [x] Create release PR `develop -> main`.
- [x] Bump version and generate changelog notes.
- [x] Publish package to npm.
