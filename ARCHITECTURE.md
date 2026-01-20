# Architecture plan

This document defines how the CLI is structured, how commands are exposed, and how the app stays scalable and maintainable.

## Goals
- Scalable command system with minimal coupling
- Clear separation between routing, prompting, and artifact generation
- Provider-agnostic AI layer
- Easy to extend with new flows and templates
- Portable installation via npm

## Proposed CLI framework

Use **Node.js + TypeScript** with a multi-command CLI framework.

Current implementation: **commander**
- Lightweight CLI for fast iteration
- Easy to migrate to oclif later

Planned upgrade: **oclif**
- Mature multi-command structure
- Built-in help, topics, and plugins

## High-level modules

1) **CLI Layer**
   - Command parsing
   - Flags and input validation

2) **Router**
   - Intent detection
   - Flow selection

3) **Prompt Engine**
   - Loads flow scripts
   - Merges user answers with templates
   - Enforces gates

4) **Artifact Generator**
   - Renders templates
   - Writes files to workspace

5) **Workspace Manager**
   - Handles project metadata
   - Keeps index of active projects

6) **AI Provider**
   - Abstracts model provider (Codex, local, remote)
   - Provides consistent request/response format

## Clean architecture alignment

- Domain: flow models, gates, artifacts (pure rules)
- Use cases: route, prompt, generate, validate
- Adapters: CLI commands, file I/O
- Infrastructure: AI providers, filesystem, network

## Codex local integration

The CLI uses the local `codex` executable when available:
- `sdd-tool ai status` checks availability
- `sdd-tool ai exec "<prompt>"` runs `codex exec`

## Folder structure (proposed)

```
src/
  cli/                 # command entrypoints
  commands/            # hello, route, req, gen, learn
  router/              # intent detection and flow loading
  prompts/             # prompt assembly + gating
  providers/           # AI providers
  workspace/           # project metadata, file I/O
  templates/           # document templates
  schemas/             # JSON schema validators
  diagrams/            # diagram generators (Mermaid)
  utils/
flows/                 # domain playbooks
router/                # scripted flow definitions
schemas/               # JSON schemas
templates/             # markdown templates
```

## Command exposure (npm)

In `package.json`:
```
"bin": {
  "sdd-tool": "./dist/cli.js",
  "sdd": "./dist/cli.js"
}
```

This enables:
```
npm install -g sdd-tool
sdd-tool hello
```

## Maintainability strategy

- **Schema-first**: artifacts must validate against JSON schemas
- **Flow-first**: new domains are added by adding flows, not code
- **Template-first**: content changes are in templates
- **Provider-agnostic**: replace AI provider with minimal changes
- **Strict gates**: no silent skips in the pipeline

## Scaling plan

- Add new flows by creating `router/*.flow.md` and `flows/*.md`
- Add new generators by adding templates and schema validators
- Add new providers by implementing the provider interface

## Research references

- oclif: https://oclif.io
- commander: https://github.com/tj/commander.js
- XDG base directory spec: https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
