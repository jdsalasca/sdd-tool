# Maintenance

## Routine checks
- Run `npm test` before releases.
- Run `scripts/e2e.ps1 -Project e2e-local` on Windows or `scripts/e2e.sh <name>` on macOS/Linux.
- Run `sdd-cli doctor` after schema or template changes.

## Versioning
- Use `npm version patch|minor|major --no-git-tag-version`.
- Publish after `develop` is green.

## Docs
- Update `docs/INDEX.md` when adding or moving files.
- Update `docs/CHANGELOG.md` for behavior changes.
