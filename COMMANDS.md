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
  - Lists flows, templates, and projects
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

## PR review
- `sdd-tool pr start`
- `sdd-tool pr audit`
- `sdd-tool pr respond`
- `sdd-tool pr finish`
- `sdd-tool pr report`

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

## Common flags
- `--approve`   Skip confirmations if gates pass
- `--improve`   Trigger self-audit and regenerate
- `--project`   Select or name the project
- `--output`    Override workspace output
- `--parallel`  Generate in parallel

## Error handling
- If a gate fails, the command provides missing items and re-prompts.
- If external links are requested, explicit approval is required.
