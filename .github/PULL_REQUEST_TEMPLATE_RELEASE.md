# Release Summary

## Version
- [ ] Target tag is `vX.Y.Z`
- [ ] `package.json` version matches target tag

## Release Artifacts
- [ ] `npm run release:notes -- --write --version vX.Y.Z`
- [ ] `npm run release:metrics > docs/releases/vX.Y.Z-metrics.md`
- [ ] `npm run release:changelog -- --version vX.Y.Z`

## Publish Safety
- [ ] `npm run verify:release-tag -- --tag vX.Y.Z`
- [ ] `npm run verify:publish`
- [ ] `NPM_TOKEN` is configured for `.github/workflows/npm-publish.yml`

## Validation
- [ ] `npm test`
- [ ] `npm run check:docs`
- [ ] `npm run smoke:autopilot`

## Notes
- Breaking changes:
- Migration notes:
- Post-release follow-ups:
