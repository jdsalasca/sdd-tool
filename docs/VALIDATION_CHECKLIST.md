# Validation checklist

Use this to ensure templates, schemas, and flows align.

## Templates
- Every placeholder in templates exists in `templates/template-index.json`.
- Template index conforms to `schemas/template.schema.json`.
- Every flow in `docs/FLOW_TEMPLATE_MAP.md` has templates present in `templates/`.
- Prompt packs in `templates/prompt-pack-index.json` align with gates.

## Schemas
- Every artifact has a schema definition.
- Sample JSON exists for each schema.
- Required fields match prompts and gates.
- Diagram metadata uses `schemas/diagram.schema.json`.
- Prompt pack metadata uses `schemas/prompt-pack.schema.json`.

## Examples
- `examples/schemas/` includes sample JSON for all core schemas.
- `examples/artifacts/` includes samples for core templates.

## Flows
- Each flow specifies required outputs.
- Flow outputs exist as templates or generators.
- Gates cover acceptance criteria, NFRs, and tests.

