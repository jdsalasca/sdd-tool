# sdd-cli

AI-orchestrated CLI for software delivery: it turns one product goal into requirements, specs, test plans, generated app code, quality checks, and optional GitHub publish.

## What It Does

- Starts from one command:
  - `sdd-tool "create a notes app with persistence"`
- Runs an end-to-end lifecycle:
  - requirement draft
  - functional/technical/architecture/test artifacts
  - generated app in `generated-app/`
  - quality gates and repair loop
  - git init/commit
  - optional GitHub publish
- Works with provider CLIs (Gemini by default, Codex optional).

## Why Use It

- Reduces time from idea to usable baseline project.
- Enforces documentation + quality gates before accepting delivery.
- Keeps artifacts traceable from planning to implementation.

## Install

```bash
npm install -g sdd-cli
```

Binary aliases:
- `sdd-cli`
- `sdd`
- `sdd-tool`

## Fast Start

```bash
sdd-tool "create a calculator app"
```

Or explicit:

```bash
sdd-cli hello "create a calculator app"
```

## Best-Payoff Commands

- `sdd-cli hello "<goal>"`: full autopilot flow.
- `sdd-cli suite "<goal>"`: continuous mode; asks only blocking questions.
- `sdd-cli status --next`: exact next command suggestion.
- `sdd-cli config show`: inspect active config.
- `sdd-cli config set <key> <value>`: set provider/model/workspace defaults.

## Global Flags

- `--approve`, `--improve`, `--parallel`
- `--non-interactive`, `--dry-run`, `--beginner`, `--from-step`, `--iterations`
- `--project`, `--output`, `--scope`, `--metrics-local`
- `--provider`, `--gemini`, `--model`

## Config (Important)

Config file:
- Windows: `%APPDATA%/sdd-cli/config.yml`
- macOS/Linux: `~/.config/sdd-cli/config.yml`

Default values:
- `workspace.default_root: {{home}}/Documents/sdd-tool-projects`
- `ai.preferred_cli: gemini`
- `ai.model: gemini-2.5-flash-lite`
- `mode.default: guided`
- `git.publish_enabled: false`

Recommended first setup:

```bash
sdd-cli config init
sdd-cli config set workspace.default_root "{{home}}/Documents/sdd-tool-projects"
sdd-cli config set ai.preferred_cli gemini
sdd-cli config set git.publish_enabled false
```

## Provider Notes

- Gemini default:
  - `sdd-cli --provider gemini hello "<goal>"`
  - shortcut: `sdd-cli --gemini hello "<goal>"`
- Auto-select available provider:
  - `sdd-cli --provider auto hello "<goal>"`
- Verify provider wiring:
  - `sdd-cli ai status`

## Output Layout

Projects are created under your workspace root:

- `<workspace>/<project>/requirements/...`
- `<workspace>/<project>/generated-app/...`
- `<workspace>/<project>/decision-log/...`

## Monitoring Artifacts

Each run writes machine-readable status files for external monitors:

- `<workspace>/<project>/sdd-run-status.json` (current stage, blockers, recovery command)
- `<workspace>/<project>/.sdd-stage-state.json` (stage machine states/history)
- `<workspace>/<project>/suite-campaign-state.json` (campaign cycle/runtime state)
- `<workspace>/<project>/generated-app/deploy/lifecycle-report.json` (quality gate results)
- `<workspace>/<project>/generated-app/deploy/lifecycle-report.md` (human-readable report)

## Release and Docs

- Changelog: `docs/CHANGELOG.md`
- Command reference: `docs/COMMANDS.md`
- Error code map: `docs/ERROR_CODES.md`
- Release notes: `docs/releases/`
- Strategy and market docs: `docs/strategy/`

## License

MIT
