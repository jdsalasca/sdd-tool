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
- [ ] Add integration tests for `req finish` rollback behavior.
- [ ] Add integration tests for `req report` expected file layout.
- [ ] Add integration tests for recursive export.

## Release Checklist

- [ ] Create feature branches by scope.
- [ ] Use Conventional Commits in every commit.
- [ ] Open PRs to `develop` and merge after green CI.
- [ ] Create release PR `develop -> main`.
- [ ] Bump version and generate changelog notes.
- [ ] Publish package to npm.
