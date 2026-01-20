# Implementation plan

This plan defines how we will implement the CLI after specs are approved.

## Phase 1: Scaffold
- Initialize Node.js + TypeScript CLI
- Setup command framework (oclif or commander)
- Wire `sdd-tool hello` and `sdd-tool route`

## Phase 2: Core engine
- Implement router and flow loading
- Implement prompt engine + gates
- Implement workspace manager (metadata + index)

## Phase 3: Artifacts
- Implement template rendering
- Validate artifacts with schemas
- Generate diagrams (Mermaid text)

## Phase 4: Provider integration
- Provider abstraction (Codex, local, remote)
- Conversation runner + self-audit (`--improve`)

## Phase 5: QA and release
- CLI smoke tests
- Template lint checks
- Release readiness checks
