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

## Publish
- npm package version bumped
- `bin` entry verified
- Basic install/run test executed


