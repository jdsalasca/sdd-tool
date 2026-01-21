# Commands (design spec)

This file defines the command set, intent, and expected behavior.

## Entry
- `sdd-tool hello`
  - Starts an interactive session
  - Lists active projects
  - Routes to correct flow

## Workspace
- `sdd-tool init`
  - Initializes a workspace and config
- `sdd-tool list`
  - Lists flows, router flows, templates, prompt packs, and projects
- `sdd-tool doctor`
  - Validates schemas, prompt packs, and templates

## Router
- `sdd-tool route`
  - Classifies intent and selects a flow

## Requirements lifecycle
- `sdd-tool req create`
- `sdd-tool req refine`
- `sdd-tool req plan`
- `sdd-tool req start`
- `sdd-tool req finish`
- `sdd-tool req archive`
- `sdd-tool req list`
- `sdd-tool req status`
- `sdd-tool req lint`
- `sdd-tool req report`
- `sdd-tool req export`

## PR review
- `sdd-tool pr start`
- `sdd-tool pr audit`
- `sdd-tool pr respond`
- `sdd-tool pr finish`
- `sdd-tool pr report`

## Test planning
- `sdd-tool test plan`

## Generators
- `sdd-tool gen requirements`
- `sdd-tool gen functional-spec`
- `sdd-tool gen technical-spec`
- `sdd-tool gen architecture`
- `sdd-tool gen best-practices`
- `sdd-tool gen project-readme`

## Learning mode
- `sdd-tool learn start`
- `sdd-tool learn refine`
- `sdd-tool learn deliver`

## AI provider
- `sdd-tool ai status`
- `sdd-tool ai exec`

## Common flags
- `--approve`   Skip confirmations if gates pass
- `--improve`   Trigger self-audit and regenerate
- `--parallel`  Generate in parallel (supported: `req plan`)

## Hello flags
- `--questions` Run prompt questions for detected intent
- `--auto`      Generate a requirement draft after questions

## Error handling
- If validation fails, the command reports errors and stops.
