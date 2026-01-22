# Router flow: Business / economics

## Entry signals
- "market", "pricing", "policy", "forecast", "economics"

## Steps
1) Interview for objective, scope, and stakeholders.
2) Define assumptions and model approach.
3) Generate analysis plan and outputs.
4) Ask for approval or `--improve`.
5) Produce sensitivity checks and executive summary.

## Required questions
- What decision will this analysis support?
- What scope and timeframe apply?
- What data sources are available?
- What assumptions are acceptable?
- What risk tolerance is required?

## Required outputs
- `requirement.md`
- `technical-spec.md`
- `architecture.md`
- `test-plan.md` (sensitivity checks)

## Scripted Q/A tree

### Q1: Decision
Q: "What decision will this analysis support?"  
A: capture decision context

### Q2: Scope and timeline
Q: "What scope and timeframe apply?"  
A: capture scope and horizon

### Q3: Data sources
Q: "What data sources are available and trusted?"  
A: capture sources

### Q4: Assumptions
Q: "What assumptions are acceptable?"  
A: capture assumptions

### Q5: Risk tolerance
Q: "What level of risk or uncertainty is acceptable?"  
A: capture tolerance

### Q6: Approval gate
Q: "Approve analysis plan and move to specs?"  
A: Yes -> generate specs  
A: No -> refine

## Gates
- Assumptions must be explicit before analysis

## Agents
- Analyst, Economist, Critic


