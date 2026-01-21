# Process (end-to-end)

This is the canonical, step-by-step lifecycle for any domain.

## 0) Entry and routing
Command: `sdd-tool hello`
- Load workspace index
- Show active projects and last activity
- Ask: new project or continue?
- If new: collect project name, domain, persona, output location
- Validate project name (letters, numbers, spaces, `-`, `_` only)
- Run intent router and select flow

## 1) Discovery (create)
Command: `sdd-tool req create`
- Ask mandatory discovery questions
- Generate `requirement.md` and `requirement.json` in backlog
- Create `changelog.md` and `progress-log.md`
- Validate against `requirement.schema.json`

## 2) Refinement (refine)
Command: `sdd-tool req refine`
- Detect ambiguity and missing data
- Ask follow-up questions
- Update requirement and changelog
- Gate: all mandatory fields complete

## 3) Planning (wip)
Command: `sdd-tool req plan`
- Generate functional, technical, and architecture specs
- Record diagram references (text-based)
- Update requirement status to `wip`
- Validate specs against schemas

## 4) Implementation readiness (start)
Command: `sdd-tool req start`
- Generate implementation plan
- Activate quality contract `quality.yml`
- Update requirement status to `in-progress`
- Gate: required specs and quality contract exist

## 5) Verification (verify)
Command: `sdd-tool test plan`
- Expand test cases and edge scenarios
- Validate test plan against schema

## Knowledge mode (learning sessions)
Command: `sdd-tool learn start`
- Capture topic, depth, format, focus areas
- Create `brief.md`, `deep-dive.md`, `reading-list.md`, `qa.md`, `session.md`

Command: `sdd-tool learn refine`
- Adjust scope, format, and constraints
- Update `session.md` and progress log

Command: `sdd-tool learn deliver`
- Write final brief, deep dive, reading list, and Q&A outputs

## 6) Completion (finish)
Command: `sdd-tool req finish`
- Seal requirement and specs
- Lock ADRs and decision log
- Mark requirement as done and archive if requested
- Update requirement status to `done`

## PR review process (specialized)
Command: `sdd-tool pr start`
- Collect PR link and approvals
- Fetch and summarize comments
- Run comment audit (valid vs debatable)

Command: `sdd-tool pr respond`
- Propose responses for each comment
- Generate fix plan and tests

Command: `sdd-tool pr finish`
- Post response summary
- Mark review work as complete

Command: `sdd-tool pr report`
- Generate review report and metrics summary
- Capture comment lifecycle status

## 7) Resume anytime
Command: `sdd-tool hello`
- Read metadata and status
- Offer next recommended step

## Global gates
- Schema validation on generated artifacts
- Required specs enforced before `req start`

## Outputs by stage
- Discovery: `requirement.md`, `summary.md`
- Planning: `functional-spec.md`, `technical-spec.md`, `architecture.md`
- Implementation: `implementation-plan.md`, `quality.yml`, `test-plan.md`
- Completion: `decision-log/`, `progress-log.md`, final `project-readme.md`
