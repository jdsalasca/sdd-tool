# Router flow: Legal / civic

## Entry signals
- "law", "court", "policy", "compliance", "contract"

## Steps
1) Interview for jurisdiction, confidentiality, and actors.
2) Define legal constraints and evidence requirements.
3) Generate requirements and risk checks.
4) Ask for approval or `--improve`.
5) Produce audit and retention guidelines.

## Required questions
- What jurisdiction and regulations apply?
- What data is privileged or sensitive?
- Who are the actors and access levels?
- What retention and audit rules exist?
- What outcomes or deliverables are required?

## Required outputs
- `requirement.md`
- `functional-spec.md`
- `technical-spec.md`
- `architecture.md`
- `test-plan.md` (access and audit checks)

## Scripted Q/A tree

### Q1: Jurisdiction
Q: "What jurisdiction and regulations apply?"  
A: capture jurisdiction and constraints

### Q2: Sensitivity
Q: "What data is privileged or sensitive?"  
A: capture data sensitivity

### Q3: Actors
Q: "Who are the actors and access levels?"  
A: capture roles and access

### Q4: Retention
Q: "What retention and audit rules exist?"  
A: capture retention rules

### Q5: Outcomes
Q: "What outcomes or deliverables are required?"  
A: capture deliverables

### Q6: Approval gate
Q: "Approve requirements and move to specs?"  
A: Yes -> generate specs  
A: No -> refine

## Gates
- Compliance constraints required before plan

## Agents
- Legal Analyst, Compliance, QA
