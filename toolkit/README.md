# SDD Toolkit (MCP-Oriented Utilities)

This folder hosts autonomous runtime/tool integrations that `sdd-tool` agents can use while keeping orchestration logic independent.

## Goals

- Provide cross-platform runtime observability helpers for Windows/macOS/Linux.
- Persist machine-readable artifacts under `generated-app/deploy/` for monitor/audit tools.
- Keep `sdd-tool` decoupled from any specific UI monitor.

## Current utility

- `runtime-visual-probe`
  - Captures a runtime screenshot after app startup.
  - Performs pixel-level analysis (luma variance, dominant-color ratio, entropy, static frame check).
  - Writes:
    - `generated-app/deploy/runtime-visual-probe.json`
    - `generated-app/deploy/runtime-visual-probe.md`
    - screenshot under `generated-app/deploy/visual/`
  - For desktop-targeted goals, `runtime_start` fails if probe indicates likely blank runtime.

- `software-diagnostic-toolkit`
  - Runs runtime HTTP reachability probe.
  - Executes optional browser interaction probe (Playwright when available): open app, click controls, capture errors/screenshots.
  - Writes:
    - `generated-app/deploy/software-diagnostic-report.json`
    - `generated-app/deploy/software-diagnostic-report.md`
  - Feeds blocking diagnostics back into autonomous repair loops.

## Environment flags

- `SDD_VISUAL_PROBE=0` disables visual probe.
- `SDD_VISUAL_PROBE_WAIT_MS=<ms>` wait time before capture (default `5000`, max `20000`).

## MCP notes

`toolkit/mcps/` contains MCP-style manifests/scaffolds that can be used by external agent runtimes.
They are optional and do not create a hard dependency for `sdd-tool`.
