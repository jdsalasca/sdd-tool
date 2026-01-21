# Template lint rules

Use these rules to validate templates before release.

## Rules
- All placeholders must be declared in `templates/template-index.json`.
- No placeholder appears in a template without an entry in the index.
- Placeholders should be lowercase with underscores.
- Each template must have at least one placeholder.

## Checks
- Compare template placeholders vs schema fields for overlap.
- Ensure required schema fields have a matching placeholder.
