# Requirements alignment

This document confirms that requirements, specs, gates, and artifacts align.

## Coverage sources
- Requirements -> `schemas/requirement.schema.json`
- Specs -> `schemas/functional-spec.schema.json`, `schemas/technical-spec.schema.json`
- Architecture -> `schemas/architecture.schema.json`
- Tests -> `schemas/test-plan.schema.json`
- Quality -> `schemas/quality.schema.json`

## Cross-checks
- Gates to prompts: `GATE_PROMPT_MATRIX.md`
- Gates to schemas: `GATE_SCHEMA_MAP.md`
- Gates to templates: `GATE_TEMPLATE_MAP.md`
- Flow coverage: `FLOW_COVERAGE.md`

## Alignment status
- All flows mapped to templates and gates
- All templates indexed with placeholders
- All schemas have sample JSON
