# Automation outline

This describes future automation checks for release readiness.

## Lint and validation
- Validate templates against `template-index.json`
- Validate examples against schemas
- Ensure flow compliance checklist passes

## Report generation
- Auto-generate `SPEC_COMPLETENESS_REPORT.md` per project
- Generate quality score from `QUALITY_SCORE_RUBRIC.md`

## Release checks
- Verify CLI commands exist
- Verify npm bin entries
- Smoke test `sdd-tool hello`
