# Commands (design spec)

This file defines the command set, intent, and expected behavior.

## Entry
- `sdd-cli hello`
  - Starts an interactive session
  - Lists active projects
  - Routes to correct flow

## Workspace
- `sdd-cli init`
  - Initializes a workspace and config
- `sdd-cli list`
  - Lists flows, router flows, templates, prompt packs, and projects
- `sdd-cli doctor`
  - Validates schemas, prompt packs, and templates

## Router
- `sdd-cli route`
  - Classifies intent and selects a flow

## Requirements lifecycle
- `sdd-cli req create`
- `sdd-cli req refine`
- `sdd-cli req plan`
- `sdd-cli req start`
- `sdd-cli req finish`
- `sdd-cli req archive`
- `sdd-cli req list`
- `sdd-cli req status`
- `sdd-cli req lint`
- `sdd-cli req report`
- `sdd-cli req export`

## PR review
- `sdd-cli pr start`
- `sdd-cli pr audit`
- `sdd-cli pr respond`
- `sdd-cli pr finish`
- `sdd-cli pr report`

## Test planning
- `sdd-cli test plan`

## Generators
- `sdd-cli gen requirements`
- `sdd-cli gen functional-spec`
- `sdd-cli gen technical-spec`
- `sdd-cli gen architecture`
- `sdd-cli gen best-practices`
- `sdd-cli gen project-readme`

## Learning mode
- `sdd-cli learn start`
- `sdd-cli learn refine`
- `sdd-cli learn deliver`

## AI provider
- `sdd-cli ai status`
- `sdd-cli ai exec`

## Common flags
- `--approve`   Skip confirmations if gates pass
- `--improve`   Trigger self-audit and regenerate
- `--project`   Select or name the project
- `--output`    Override workspace output root
- `--parallel`  Generate in parallel (supported: `req plan`)

## Hello flags
- `--questions` Run prompt questions for detected intent
- `--auto`      Generate a requirement draft after questions

## Error handling
- If validation fails, the command reports errors and stops.

