# Commands (design spec)

This file defines the command set, intent, and expected behavior.

## Entry
- `sdd-cli hello`
  - Starts an interactive session
  - Lists active projects
  - Routes to the correct flow
  - Default mode: runs full guided autopilot (`create -> plan -> start -> test -> finish`)
  - Manual mode: use `--questions` for deep prompt-by-prompt discovery
- `sdd-cli quickstart`
  - Runs a zero-friction autopilot demo using built-in examples
  - Defaults to non-interactive execution for faster first success
  - Use `--example <name>` to select scenario (`saas|bugfix|api|ecommerce|mobile`)

## Workspace
- `sdd-cli init`
  - Initializes a workspace and config
- `sdd-cli config show`
  - Shows effective config and config file path
- `sdd-cli config init`
  - Creates default config file and default workspace root if missing
- `sdd-cli config set <key> <value>`
  - Updates config values (`workspace.default_root`, `ai.preferred_cli`, `ai.model`, `mode.default`, `git.publish_enabled`)
- `sdd-cli list`
  - Lists flows, router flows, templates, prompt packs, and projects
- `sdd-cli status`
  - Shows per-status requirement counts for the selected project
  - Use `--next` to get an exact recommended next command
- `sdd-cli scope list`
  - Lists workspace scopes in the current workspace root
- `sdd-cli scope status <scope>`
  - Shows project status summary for one scope
- `sdd-cli doctor`
  - Validates schemas, prompt packs, and templates
  - Use `--fix` to auto-create missing `changelog.md` and `progress-log.md` in requirement folders
  - Also repairs missing requirement folder layout and JSON skeleton artifacts

## Router
- `sdd-cli route`
  - Classifies intent and selects a flow

## Imports
- `sdd-cli import issue <url>`
  - Imports a GitHub issue and uses it to bootstrap hello autopilot
  - Good for turning existing backlog items into SDD artifacts quickly
- `sdd-cli import jira <ticket>`
  - Imports a Jira ticket key or browse URL and bootstraps hello autopilot
- `sdd-cli import linear <ticket>`
  - Imports a Linear ticket key or issue URL and bootstraps hello autopilot
- `sdd-cli import azure <work-item>`
  - Imports an Azure Boards work item id (`AB#1234`, `1234`) or work item URL and bootstraps hello autopilot
- Additional adapter roadmap (Azure/GitLab): `docs/INTEGRATION_ADAPTERS.md`

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
- `sdd-cli pr bridge`
- `sdd-cli pr risk`
- `sdd-cli pr bridge-check`

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
- `--scope`     Namespace workspace/project data for monorepo targeting
- `--metrics-local` Enable local opt-in telemetry snapshots under `workspace/metrics`
- `--provider <name>` Select AI provider (`gemini|codex|auto`), default `gemini`
- `--gemini` Shortcut for `--provider gemini`
- `--model <name>` Select provider model (for example `gemini-2.5-flash-lite`)
- `--iterations <n>` Number of delivery improvement iterations (`1..10`) with review->stories->implement loops (default `2`)

## Metrics utilities
- `npm run metrics:summary -- <workspace-root>`
  - Summarizes local opt-in activation and command usage snapshots
- `--parallel`  Generate in parallel (supported: `req plan`)
- `--questions` Use manual question flow instead of full autopilot
- `--non-interactive` Run without prompt confirmations (CI/script usage)
- `--dry-run` Preview hello autopilot steps without writing artifacts
- `--beginner` Enable extra step-by-step guidance in hello flow
- `--from-step` Resume autopilot from a specific stage (`create|plan|start|test|finish`)

## Hello behavior
- Default: full guided autopilot run with minimal prompts
- With direct intent input (example: `sdd-cli hello "build booking app"`), hello runs in auto-guided mode:
  - Uses current workspace defaults without confirmation prompts
  - Auto-selects new flow unless `--project <name>` is provided
  - Auto-generates project name when missing
  - Generates app scaffold under `generated-app/`
  - Runs lifecycle orchestration (quality checks, deploy artifacts, git init/commit, GitHub publish attempt via `gh` when authenticated)
  - Enforces minimum quality rounds and approval streak before final acceptance
- `--questions`: manual question packs and explicit draft confirmation
- `--beginner`: keeps autopilot behavior but adds beginner-friendly explanations at each step
- `--auto`: alias to trigger question-driven draft generation path

## Error handling
- If validation fails, the command reports machine-readable codes (`SDD-xxxx`) and exits non-zero.
- See `docs/ERROR_CODES.md` for ranges and remediation guidance.

 - `sdd-cli suite [input...]`
  - Starts continuous orchestration mode
  - Uses autopilot defaults and only asks blocker questions (for example app type or stack) when missing
  - Supports one-liner usage through direct input routing
