# Release readiness checklist

## Pre-release
- All flows pass `docs/FLOW_COMPLIANCE_CHECKLIST.md`
- Templates validated by `docs/TEMPLATE_LINT_RULES.md`
- Schemas validated with sample JSON
- Diagrams rendered or validated

## Release notes
- New commands documented
- Breaking changes noted
- Migration notes (if any)
- `npm run release:notes` generated and reviewed
- `npm run release:metrics` generated and reviewed
- `npm run release:changelog -- --version vX.Y.Z` generated and reviewed

## Publish
- npm package version bumped
- `bin` entry verified
- Basic install/run test executed
- Tag push triggers `.github/workflows/release.yml` successfully
- `npm run verify:release-tag -- --tag vX.Y.Z` passes
- `npm run verify:publish` passes (`npm pack --dry-run` includes required files)
- `.github/workflows/npm-publish.yml` succeeds with `NPM_TOKEN`


