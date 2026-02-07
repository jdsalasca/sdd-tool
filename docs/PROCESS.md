# Process (end-to-end)

This is the canonical, step-by-step lifecycle for any domain.

## 0) Entry and routing
Command: `sdd-cli hello`
- Load workspace index
- Show active projects and last activity
- In auto-guided default mode (direct input), auto-select new flow and skip extra confirmations
- If no project is provided, suggest or auto-generate one in default flow
- Run intent router and select flow
- Default mode now runs a guided autopilot pipeline from create to finish
- Manual question flow remains available with `--questions`
- Fast onboarding entry is also available via `sdd-cli quickstart --example <name>`
- Beginner-guided narration is available with `--beginner`
- Existing backlog items can enter via `sdd-cli import issue <github-url>`
- Existing Jira tickets can enter via `sdd-cli import jira <ticket|browse-url>`

## 1) Discovery (create)
Command: `sdd-cli req create`
- In autopilot mode, use safe defaults to reduce mandatory prompts
- In manual mode, ask discovery questions directly
- Generate `requirement.md` and `requirement.json` in backlog
- Create `changelog.md` and `progress-log.md`
- Validate against `requirement.schema.json`

## 2) Refinement (refine)
Command: `sdd-cli req refine`
- Detect ambiguity and missing data
- Ask follow-up questions
- Update requirement and changelog
- Gate: all mandatory fields complete

## 3) Planning (wip)
Command: `sdd-cli req plan`
- Generate functional, technical, and architecture specs
- Record diagram references (text-based)
- Update requirement status to `wip`
- Validate specs against schemas
- Supports autopilot defaults when invoked by `hello`

## 4) Implementation readiness (start)
Command: `sdd-cli req start`
- Generate implementation plan
- Activate quality contract `quality.yml`
- Update requirement status to `in-progress`
- Gate: required specs and quality contract exist
- Supports autopilot defaults when invoked by `hello`

## 5) Verification (verify)
Command: `sdd-cli test plan`
- Expand test cases and edge scenarios
- Validate test plan against schema
- Supports autopilot defaults when invoked by `hello`

## Knowledge mode (learning sessions)
Command: `sdd-cli learn start`
- Capture topic, depth, format, focus areas
- Create `brief.md`, `deep-dive.md`, `reading-list.md`, `qa.md`, `session.md`

Command: `sdd-cli learn refine`
- Adjust scope, format, and constraints
- Update `session.md` and progress log

Command: `sdd-cli learn deliver`
- Write final brief, deep dive, reading list, and Q&A outputs

## 6) Completion (finish)
Command: `sdd-cli req finish`
- Seal requirement and specs
- Lock ADRs and decision log
- Mark requirement as done and archive if requested
- Update requirement status to `done`
- Supports autopilot defaults when invoked by `hello`

## PR review process (specialized)
Command: `sdd-cli pr start`
- Collect PR link and approvals
- Fetch and summarize comments
- Run comment audit (valid vs debatable)

Command: `sdd-cli pr respond`
- Propose responses for each comment
- Generate fix plan and tests

Command: `sdd-cli pr finish`
- Post response summary
- Mark review work as complete

Command: `sdd-cli pr report`
- Generate review report and metrics summary
- Capture comment lifecycle status

Command: `sdd-cli pr bridge`
- Link PR review outputs back into requirement artifacts for traceability

## 7) Resume anytime
Command: `sdd-cli hello`
- Read metadata and status
- Offer next recommended step
- In default flow, provide step-by-step progress narration with intent, planning, testing, and finalization
- Autopilot checkpoints are persisted per project and resumed automatically when available
- Recovery can be forced with `--from-step create|plan|start|test|finish`

Recovery commands:
- Continue a known project: `sdd-cli --project <name> hello "continue this requirement"`
- Resume a failed stage directly: `sdd-cli --project <name> --from-step test hello "resume"`
- Run script/CI-safe defaults: `sdd-cli --non-interactive hello "<intent>"`
- Preview full autopilot without writes: `sdd-cli --dry-run hello "<intent>"`
- On autopilot interruption, `hello` prints a ready-to-run recovery command with `--project` and `--from-step`.
- Run `sdd-cli --project <name> status --next` to get the next recommended command from current requirement states.

## Global gates
- Schema validation on generated artifacts
- Required specs enforced before `req start`

## Outputs by stage
- Discovery: `requirement.md`, `requirement.json`, `summary.md`
- Planning: `functional-spec.md`, `technical-spec.md`, `architecture.md`, `test-plan.md`
- Implementation: `implementation-plan.md`, `quality.yml`
- Completion: `decision-log/`, `progress-log.md`, final `project-readme.md`



