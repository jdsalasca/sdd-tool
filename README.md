# sdd-cli

Specification-driven delivery CLI that turns requirements into specs, architecture, tests, and traceable docs.

## Repository overview

This repo hosts the CLI implementation, domain flows, templates, schemas, and structured documentation for the SDD workflow.

## Vision (think pyramids)

Build the foundation once, then lift everything else. The tool provides a durable structure: requirements, architecture, technical specs, quality gates, test plans, and decision logs. AI gets "wings" by being guided, constrained, and accountable at every step.

Mission and vision live in `docs/MISSION.md` and `docs/VISION.md`.

Deep process, commands, interactions, and diagrams live in:
- `docs/PROCESS.md`
- `docs/COMMANDS.md`
- `docs/INTERACTIONS.md`
- `docs/DIAGRAMS.md`
- `docs/ARCHITECTURE.md`
- `docs/SDD_CHECKLIST.md`
- `docs/GLOSSARY.md`
- `docs/VALIDATION_CHECKLIST.md`
- `docs/FLOW_TEMPLATE_MAP.md`
- `docs/GATE_PROMPT_MATRIX.md`
- `docs/TEMPLATE_LINT_RULES.md`
- `docs/FLOW_GATE_MAP.md`
- `docs/FLOW_COMPLIANCE_CHECKLIST.md`
- `docs/RELEASE_READINESS_CHECKLIST.md`
- `docs/AUTOMATION_OUTLINE.md`
- `docs/GATE_SCHEMA_MAP.md`
- `docs/GATE_TEMPLATE_MAP.md`
- `docs/KNOWLEDGE_MODE_CHECKLIST.md`
- `docs/DOMAIN_COMPLETENESS_CHECKLIST.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/CLEAN_ARCHITECTURE_CHECKLIST.md`
- `docs/REQUIREMENTS_ALIGNMENT.md`
- `docs/GITFLOW.md`
- `docs/RELEASE_PROCESS.md`

Reports live in:
- `docs/reports/E2E_REPORT.md`
- `docs/reports/FLOW_COVERAGE.md`
- `docs/reports/GATE_COVERAGE_REPORT.md`
- `docs/reports/GATE_TEMPLATE_COVERAGE_REPORT.md`
- `docs/reports/PACK_COVERAGE_REPORT.md`
- `docs/reports/PROMPT_AUDIT_REPORT.md`
- `docs/reports/PROMPT_COVERAGE_REPORT.md`
- `docs/reports/QUALITY_SCORE_RUBRIC.md`
- `docs/reports/SPEC_COMPLETENESS_REPORT.md`

Examples and templates:
- `examples/transcripts/`
- `examples/artifacts/`
- `examples/schemas/`
- `examples/diagrams/`
- `examples/packs/`
- `templates/`
- `schemas/`

Automation:
- `scripts/e2e.ps1`
- `scripts/e2e.sh`

### AI gets wings through structure
- **Question banks** enforce clarity before planning.
- **Quality contracts** enforce clean code across languages.
- **Decision logs** make trade-offs explicit.
- **Proof gates** ensure tests and acceptance criteria are met.
- **Multi-agent roles** ensure no single blind spot dominates.

## Why SDD matters

An SDD (Software Design Document) translates requirements into architecture and technical design decisions. It exists to reduce ambiguity, drive alignment, and protect quality across the lifecycle.

Key properties:
- Clear decisions and trade-offs.
- Traceability from requirement to design and tests.
- Versioned, auditable progress.
- Designed for real delivery, not just documentation.

## What this tool generates

- Requirements (functional + non-functional)
- Functional specs (flows, use cases, rules)
- Technical specs (stack, interfaces, data, security)
- Architecture (C4, containers, components, deployment)
- Best practices and quality gates
- Test plan and acceptance criteria
- Summary (objective, key decisions, open questions)
- Decision log (ADR-style)
- Progress log
- Project README aligned to the SDD

## Install and run (cross-platform)

```
npm install -g sdd-cli
```

Then:
```
sdd-cli hello
```

Package name on npm is `sdd-cli` (CLI commands remain `sdd-cli` and `sdd`).

Project names must use letters, numbers, spaces, `-` or `_`, and cannot include path separators.

The `hello` command is the entry point: it connects to AI, lists active projects, and offers to create a new one or continue. It then runs a guided, happy-path sequence from discovery to completion.

## The happy path (end-to-end flow)

1) **Start**  
   `sdd-cli hello` connects to AI, shows active projects, and asks if you want to start new or continue.
   It also asks for project name, domain, output location, language profile, and quality level.

2) **Discover**  
   Guided prompts produce `requirements/backlog/REQ-0001/requirement.md`.

3) **Refine**  
   `sdd-cli req refine` resolves ambiguity, missing metrics, and risks.

4) **Plan (WIP)**  
   `sdd-cli req plan` creates functional spec, tech spec, and architecture drafts.

5) **Implement**  
   `sdd-cli req start` generates the implementation plan and activates quality gates.

6) **Verify**  
   `sdd-cli test plan` defines scenarios and coverage targets.

7) **Finish**  
   `sdd-cli req finish` seals the requirement, versioned docs, and decision logs.

## Commands (proposed)

### Core
- `sdd-cli hello` -- interactive session, project picker, full guided flow
- `sdd-cli init` -- create SDD workspace and config
- `sdd-cli list` -- list flows, router flows, templates, prompt packs, and projects
- `sdd-cli doctor` -- validate completeness and consistency

### Router
- `sdd-cli route` -- classify user intent and route to the right flow

### Requirement lifecycle
- `sdd-cli req create`
- `sdd-cli req refine`
- `sdd-cli req plan`
- `sdd-cli req start`
- `sdd-cli req finish`

### Generators
- `sdd-cli gen requirements`
- `sdd-cli gen functional-spec`
- `sdd-cli gen technical-spec`
- `sdd-cli gen architecture`
- `sdd-cli gen best-practices`
- `sdd-cli gen project-readme`

### Test planning
- `sdd-cli test plan`

### Learning mode
- `sdd-cli learn start`
- `sdd-cli learn refine`
- `sdd-cli learn deliver`

### Flags
- `--approve` -- run without extra confirmations
- `--improve` -- re-open and enhance existing docs
- `--output <path>` -- override workspace output
- `--project <name>` -- set project name
- `--parallel` -- generate in parallel
- `--alias sdd` -- optional alias to run as `sdd`

## Where files are stored (clean repos)

By default, the tool writes to a dedicated workspace, not into your repo:

- Default (global workspace):  
  - Windows: `%APPDATA%/sdd-cli/workspaces/<project>`  
  - macOS/Linux: `~/.config/sdd-cli/workspaces/<project>`

Optional:
- `--output ./docs/sdd` to keep SDD next to the repo
- `--output ../_sdd/<project>` for a separate shared directory

## Lifecycle folders

```
docs/
  requirements/
    backlog/
    wip/
    in-progress/
    done/
    archived/
```

`wip/` is the planning and design stage. `in-progress/` is optional for implementation-specific tracking.

## How we ensure the right questions get asked

### Mandatory discovery fields
- Clear objective (measurable)
- Users/actors
- Scope and out-of-scope
- Acceptance criteria
- Non-functional requirements (security, performance, availability)
- Data sensitivity and compliance requirements

### Ambiguity detection
- Vague adjectives require metrics ("fast", "secure", "scalable")
- Missing scale (traffic, data size, concurrency) is blocked
- External dependencies must be listed or the flow stops

### Persona-aware questions
- The question bank adapts to the selected flow (law, education, data science, etc.).
- Domain rules add extra checks (compliance, audit, bias, safety).

### Consistency gate
`sdd-cli doctor` ensures every requirement has matching specs, tests, and ADRs.

## Clean code across any language

### Quality contract
`quality.yml` defines global standards and language-specific toolchains.

General rules:
- Single responsibility per function/class
- Explicit error handling and consistent logging
- Formatting and linting required
- Tests for critical flows
- Max complexity threshold

Language profiles (opt-in):
- JS/TS: ESLint + Prettier + Vitest
- Python: Ruff/Black + Pytest
- Go: gofmt + golangci-lint + go test
- Java: Checkstyle/SpotBugs + JUnit

## Multi-agent coordination

### Roles
- **Req Analyst** -- clarity and acceptance criteria
- **Solution Architect** -- design and trade-offs
- **Tech Lead** -- implementation plan and quality
- **QA** -- test plan, edge cases, coverage
- **Docs Scribe** -- changelog, ADRs, progress log

### Agent exit contract
Each agent must leave:
- Summary of work
- Changes made
- Risks and open questions
- Next steps

## Codex-ready workflow (skills)

The tool is designed to work cleanly with Codex and other AI agents by providing:
- A consistent folder structure and artifact names
- Explicit question banks and ambiguity detection
- Clear agent roles and handoffs
- A required progress log and decision log

See `skills/` for the agent protocol and prompt packs.

## AI "wings": the framework

AI should not guess. It should be guided, constrained, and verified.

1) **Clarify** -- ask missing questions
2) **Commit** -- lock scope and acceptance criteria
3) **Design** -- architecture and trade-offs
4) **Prove** -- tests and validations
5) **Deliver** -- clean code and docs
6) **Reflect** -- changelog and decision log

## Intent router (multi-domain)

The router identifies the user intent and routes to the correct flow, prompts, and artifacts.

### Example
User: `sdd-cli hello`  
User input: "I have a bug: <link>. How to solve?"

Router actions:
1) Detect intent: **bug fix**
2) Ask permission to fetch the link and read it
3) If approved, read and summarize the issue
4) Offer **5+ solution options** with trade-offs
5) Ask the user for their view of the bug and more context
6) Continue into requirements -> functional spec -> technical spec -> architecture
7) If not happy, user runs `--improve` to trigger self-audit and regenerate

### Router signals (high level)
- **Bug fix**: "bug", "issue", "error", stack trace, repro steps
- **Learning**: "learn", "explain", "teach me", "what is"
- **Design/creative**: "logo", "brand", "layout", "art", "visual"
- **Research**: "study", "paper", "literature", "survey"
- **Data science**: "model", "dataset", "prediction"
- **Business/economics**: "market", "pricing", "forecast"
- **Legal/civic**: "court", "policy", "compliance"
- **PR review**: "PR", "pull request", "review comments", "code review"

### Router output
- Selected flow
- Required prompts
- Required artifacts
- Quality gates
- Suggested agents

## Router scripts and schemas

- `router/` contains step-by-step conversation scripts by intent.
- `schemas/` defines JSON schemas for core artifacts and session data.

These files are the source of truth for the CLI behavior.

## Bug-first workflow (deep detail)

When a user reports a bug, the tool must:
- Gather the issue context (link, repo, environment)
- Ask for reproduction steps and severity
- Propose 5+ resolution paths (quick fix, rollback, root-cause, refactor, hotfix)
- Ask the user to confirm the preferred path
- Generate requirements and specs for the fix
- Gate implementation until tests and risk checks are defined

## Cross-domain coverage

The router supports **software and non-software** flows:
- Software engineering (features, bugs, refactors)
- Data science (models, pipelines, experiments)
- Design and art (visual systems, branding, layout)
- Humanities (history, sociology, education)
- Business and economics (market, policy, pricing)
- PR review and code feedback workflows

## Knowledge-first mode (deep research sessions)

The tool is not only for software requirements. It can also run **knowledge journeys** where the user wants to learn a topic deeply (e.g., "I want to know more about Egypt").

### How it works
1) **Interview** the user to understand depth, audience, purpose, and constraints.
2) **Build a research plan** (outline, key questions, scope boundaries).
3) **Run multi-agent synthesis** with specialized roles (historian, critic, summarizer).
4) **Deliver layered outputs**: executive summary, deep dive, references, and follow-up prompts.

### Commands (proposed)
- `sdd-cli learn start` -- begin a guided research session
- `sdd-cli learn refine` -- refine scope or depth
- `sdd-cli learn deliver` -- produce final output package

### Interview prompts (examples)
- Why do you want to learn this topic?
- What level of depth (overview, academic, expert)?
- What format do you want (summary, syllabus, report, Q&A)?
- Any focus areas (history, culture, economy, politics)?
- Time available to read or study?

### Quality framework for answers
- Bias checks and alternative viewpoints
- Source reliability scoring
- Clear assumptions and confidence levels
- A "what to read next" section

### Outputs (knowledge workspace)
- `brief.md` -- short explanation
- `deep-dive.md` -- extended structured answer
- `reading-list.md` -- curated sources
- `qa.md` -- questions and answers
- `progress-log.md` -- session history

This mode uses the same "AI wings" principle: clarify, commit, design, prove, deliver, reflect.

## MVP v1 (exhaustive command and prompt scope)

### MVP goals
- One command to enter (hello), one command to finish (req finish).
- Always ask the right questions before planning or implementation.
- Always create a workspace, never contaminate dependencies.

### MVP commands
Core:
- `sdd-cli hello`
- `sdd-cli init`
- `sdd-cli list`
- `sdd-cli doctor`

Requirements:
- `sdd-cli req create`
- `sdd-cli req refine`
- `sdd-cli req plan`
- `sdd-cli req start`
- `sdd-cli req finish`

Generators:
- `sdd-cli gen requirements`
- `sdd-cli gen functional-spec`
- `sdd-cli gen technical-spec`
- `sdd-cli gen architecture`
- `sdd-cli gen best-practices`
- `sdd-cli gen project-readme`

### MVP prompts (must-ask list)
Discovery:
- Objective (measurable outcome)
- Users/actors and their needs
- Scope and out-of-scope
- Acceptance criteria
- NFRs: security, performance, availability
- Data sensitivity and compliance
- Constraints (budget, deadlines, platforms)

Persona-specific extensions:
- Legal: privilege, retention, audit, jurisdiction
- Education: rubric, accessibility, student privacy
- Data science: bias, drift, metrics, monitoring
- Software: dependencies, regression risk, rollout
- Bug fix: repro steps, severity, rollback

Planning:
- Minimal viable architecture
- Key integrations and dependencies
- Data model outline
- Error handling and logging strategy
- Observability requirements

Implementation readiness:
- Test plan (critical paths + edge cases)
- Quality contract profile
- Definition of Done checklist

### MVP outputs (required)
- `requirement.md`
- `functional-spec.md`
- `technical-spec.md`
- `architecture.md`
- `test-plan.md`
- `quality.yml`
- `decision-log/ADR-0001.md`
- `progress-log.md`
- `project-readme.md`

## Interactive session (hello) design

### Steps
1) **Connect** to AI and load local workspace index.
2) **List active projects** with status (backlog, wip, done).
3) **Choose**: start new or continue.
4) **Context**: ask domain and persona to load the right flow.
5) **Plan**: run discovery prompts and generate backlog artifacts.
6) **Advance**: offer refine, plan, or start automatically.

### Data model (concept)
- `workspaces.json` tracks projects and last activity.
- Each project has `metadata.json` with domain, status, language profile.

## End-to-end framework (single command experience)

The goal is a single entry command that ends in a deliverable package:
- Documents are structured
- Decisions are logged
- Tests are planned
- Quality gates are in place
- Users can resume at any point

## Workspace layout (canonical)

Each project is self-contained and resumable:
```
<workspace>/
  metadata.json
  requirements/
    backlog/
    wip/
    in-progress/
    done/
    archived/
  pr-reviews/
    PR-123/
      pr-comment-audit.md
      pr-review-summary.md
      pr-review-report.md
      pr-metrics.md
      pr-comment-lifecycle.md
      guides/
      responses/
  decision-log/
  progress-log.md
  quality.yml
  test-plan.md
  project-readme.md
```

## Artifact traceability

Every requirement has:
- A unique ID (REQ-XXXX)
- Linked specs and test plan
- Decision log references
- A progress log trail

## Diagram generation (planned)

The tool can generate C4-style diagrams using templates:
- Context diagram
- Container diagram
- Component diagram

These are exported as text (Mermaid/PlantUML) to keep them versionable.

## Provider abstraction (AI)

The CLI is provider-agnostic:
- Local model
- Remote model
- Codex-compatible

The router selects agent roles, while the provider is configurable.

## Privacy and approvals

- Any external link access requires explicit user approval.
- All prompts and outputs are stored locally unless user opts in to sync.

## Gaps now covered

- Single-entry "hello" flow
- Multi-domain router and role activation
- Persona-aware questions
- Workspace isolation and resumable state
- Diagram and architecture outputs
- Cross-language quality gates

## Flows (domain playbooks)

See `flows/` for detailed, domain-specific guides:
- Lawyer
- Teacher
- Admissions admin
- State admin
- Taxes admin
- Student (university)
- Data scientist
- Programmer
- Bug fix
- Ecommerce
- Retail store
- Court system
- Graphic design
- Art
- History
- Sociology
- Economics

These are opinionated, real-world flows that demonstrate how the CLI should be used in practice.

## References (public sources)

- IEEE 1016: Software Design Description (SDD)
- C4 Model: https://c4model.com
- ADRs: https://adr.github.io
- RFC 2119 (MUST/SHOULD): https://www.rfc-editor.org/rfc/rfc2119
- User Stories: https://www.atlassian.com/agile/project-management/user-stories
- INVEST: https://www.agilealliance.org/glossary/invest/
- Definition of Done: https://www.atlassian.com/agile/project-management/definition-of-done
- BDD: https://cucumber.io/docs/bdd/
- arc42: https://arc42.org
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- Jobs to be Done: https://www.intercom.com/blog/jtbd/
- Design Thinking: https://www.interaction-design.org/literature/topics/design-thinking
- CRISP-DM: https://www.ibm.com/docs/en/spss-modeler/18.2.2?topic=dm-crisp

