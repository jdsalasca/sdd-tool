# Router flow: Bug fix

## Entry signals
- "bug", "issue", "error", stack trace, "crash", "regression"

## Steps
1) Ask permission to open external links or repos.
2) If approved, fetch and summarize issue/context.
3) Ask user perspective: what they see, expected vs actual, impact.
4) Require repro steps, environment, severity, and recent changes.
5) Generate 5+ solution paths with trade-offs.
6) Ask user to choose preferred path or request `--improve`.
7) Generate requirements and specs for the selected path.
8) Gate implementation until test plan and quality profile are set.

## Required questions
- What is the expected behavior?
- What is the actual behavior?
- Steps to reproduce?
- Environment and version details?
- Severity and impact?
- Recent changes or related issues?

## Scripted Q/A tree

### Q1: Link access
Q: "You shared a link. Do you approve opening it?"  
A: Yes -> fetch + summarize  
A: No -> ask user to paste relevant details

### Q2: User perspective
Q: "Describe what you see vs what you expect."  
A: Capture expected/actual and impact

### Q3: Repro and env
Q: "Can you share steps to reproduce and environment details?"  
A: Capture steps, version, OS, config

### Q4: Severity and scope
Q: "How severe is this and who is impacted?"  
A: Capture severity, user count, business impact

### Q5: Path selection
Q: "Here are 5+ possible fixes with trade-offs. Which path should we pursue?"  
A: Capture chosen path or request `--improve`

### Q6: Approval gate
Q: "Do you approve moving to requirements and specs?"  
A: Yes -> generate artifacts  
A: No -> refine answers

## Required outputs
- `requirement.md` (bug scope)
- `technical-spec.md` (root cause + fix)
- `test-plan.md` (repro + regression)
- `progress-log.md`

## Gates
- Repro steps required before planning
- At least one regression test required before finish

## Agents
- Req Analyst, Tech Lead, QA
