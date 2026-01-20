# Router flow: Data science

## Entry signals
- "model", "prediction", "dataset", "ML", "analytics"

## Steps
1) Interview for objective, metrics, data sources, constraints.
2) Define evaluation criteria and monitoring needs.
3) Generate specs and architecture for pipelines.
4) Ask for approval or `--improve`.
5) Create test plan for data validation and model evaluation.

## Required questions
- What is the success metric?
- What data sources and quality risks exist?
- What fairness or compliance rules apply?
- What latency/cost constraints exist?
- How will drift be monitored?

## Required outputs
- `requirement.md`
- `technical-spec.md`
- `architecture.md`
- `test-plan.md`
- `quality.yml`

## Scripted Q/A tree

### Q1: Objective and metric
Q: "What is the business or research objective and the primary metric?"  
A: capture target metric

### Q2: Data sources
Q: "What data sources exist and what are the quality risks?"  
A: capture sources and gaps

### Q3: Constraints
Q: "Any latency, cost, or compliance constraints?"  
A: capture constraints

### Q4: Fairness and bias
Q: "Any fairness or bias concerns to monitor?"  
A: capture fairness criteria

### Q5: Monitoring
Q: "How will we monitor drift post-release?"  
A: capture monitoring plan

### Q6: Approval gate
Q: "Approve requirements and move to specs?"  
A: Yes -> generate specs  
A: No -> refine

## Gates
- Metrics and validation criteria required before plan

## Agents
- Data Scientist, MLOps, QA
