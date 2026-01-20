# Process (end-to-end)

This is the canonical, step-by-step lifecycle for any domain.

## 0) Entry and routing
Command: `sdd-tool hello`
- Load workspace index
- Show active projects and last activity
- Ask: new project or continue?
- If new: collect project name, domain, persona, output location
- Run intent router and select flow

## 1) Discovery (create)
Command: `sdd-tool req create`
- Ask mandatory discovery questions
- Generate `requirement.md` in backlog
- Create `summary.md` and `progress-log.md`
- Gate: scope, acceptance criteria, NFRs required

## 2) Refinement (refine)
Command: `sdd-tool req refine`
- Detect ambiguity and missing data
- Ask follow-up questions
- Update requirement and changelog
- Gate: all mandatory fields complete

## 3) Planning (wip)
Command: `sdd-tool req plan`
- Generate functional, technical, and architecture specs
- Create initial diagrams (text-based)
- Gate: acceptance criteria and NFRs must be satisfied

## 4) Implementation readiness (start)
Command: `sdd-tool req start`
- Generate implementation plan
- Activate quality contract `quality.yml`
- Generate test plan
- Gate: test plan and quality thresholds defined

## 5) Verification (verify)
Command: `sdd-tool test plan`
- Expand test cases and edge scenarios
- Gate: critical paths, regressions, acceptance tests

## 6) Completion (finish)
Command: `sdd-tool req finish`
- Seal requirement and specs
- Lock ADRs and decision log
- Mark requirement as done and archive if requested

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
- No planning without acceptance criteria
- No implementation without test plan
- No completion without quality checks

## Outputs by stage
- Discovery: `requirement.md`, `summary.md`
- Planning: `functional-spec.md`, `technical-spec.md`, `architecture.md`
- Implementation: `implementation-plan.md`, `quality.yml`, `test-plan.md`
- Completion: `decision-log/`, `progress-log.md`, final `project-readme.md`
