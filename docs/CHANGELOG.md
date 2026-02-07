# Changelog

## Unreleased
- Add `sdd-cli import jira <ticket|browse-url>` to bootstrap autopilot from Jira work items.
- Add monorepo scope targeting with global `--scope <name>` workspace namespacing.
- Add `sdd-cli pr bridge` to link PR review outputs back into requirement artifacts.
- Add release notes automation via `npm run release:notes` and generated milestone notes.
- Add machine-readable doctor diagnostics with `SDD-xxxx` error codes and non-zero exit behavior.
- Add `sdd-cli doctor --fix` for safe remediation of missing requirement operation logs.
- Add release quality summary automation via `npm run release:metrics`.
- Add workspace index locking with stale lock recovery for concurrent write safety.

## 0.1.6
- Standardize docs and reports layout under `docs/`.
- Add workspace, validation, and generation commands plus tests.
- Improve hello flow UX and prompt exit handling on Windows.
- Add troubleshooting guidance and install warnings for CLI shims.
