# Router flow: Humanities research

## Entry signals
- "history", "sociology", "philosophy", "essay", "thesis"

## Steps
1) Interview for thesis, scope, sources, and format.
2) Define structure and methodology.
3) Generate plan and section outline.
4) Ask for approval or `--improve`.
5) Produce reading list and source checks.

## Required questions
- What is the thesis or research question?
- What scope and timeframe apply?
- What source types are acceptable?
- What format is required?
- What perspectives must be included?

## Required outputs
- `requirement.md`
- `functional-spec.md`
- `technical-spec.md` (citation rules)
- `architecture.md` (structure)
- `test-plan.md` (bias and source checks)

## Scripted Q/A tree

### Q1: Thesis
Q: "What is the thesis or research question?"  
A: capture thesis

### Q2: Scope
Q: "What period, region, or population is in scope?"  
A: capture scope boundaries

### Q3: Sources
Q: "What sources are acceptable or required?"  
A: capture source types and citation style

### Q4: Format
Q: "What output format is required?"  
A: capture format

### Q5: Perspectives
Q: "Which perspectives must be included?"  
A: capture perspectives

### Q6: Approval gate
Q: "Approve research plan and move to structure?"  
A: Yes -> generate specs  
A: No -> refine

## Gates
- Thesis and scope required before deep research

## Agents
- Researcher, Critic, Synthesizer
