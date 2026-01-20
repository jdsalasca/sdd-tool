# Router flow: Software feature

## Entry signals
- "feature", "build", "implement", "API", "backend", "frontend"

## Steps
1) Run discovery and acceptance criteria prompts.
2) Generate requirements and functional spec.
3) Generate technical spec and architecture.
4) Ask for approval or `--improve`.
5) Activate quality profile and test plan.

## Required questions
- What problem is solved and for whom?
- What is in scope/out of scope?
- What are acceptance criteria?
- What performance/security constraints apply?
- What is the rollout strategy?

## Required outputs
- `requirement.md`
- `functional-spec.md`
- `technical-spec.md`
- `architecture.md`
- `test-plan.md`
- `quality.yml`

## Scripted Q/A tree

### Q1: Problem and users
Q: "What problem are we solving and for whom?"  
A: capture user/persona and objective

### Q2: Scope
Q: "What is in scope and out of scope?"  
A: capture scope boundaries

### Q3: Acceptance criteria
Q: "What are the acceptance criteria?"  
A: capture verifiable criteria

### Q4: Constraints
Q: "Any performance, security, or compatibility constraints?"  
A: capture NFRs

### Q5: Rollout
Q: "How should we rollout and measure success?"  
A: capture rollout + metrics

### Q6: Approval gate
Q: "Approve requirements and move to specs?"  
A: Yes -> generate specs  
A: No -> refine

## Gates
- No implementation without acceptance criteria and test plan

## Agents
- Req Analyst, Solution Architect, Tech Lead, QA
