# Flow: Taxes administration

## Goal
Manage tax filing, validation, audits, and compliance with strong security and traceability.

## Discovery prompts
- What tax types are supported (income, sales, corporate)?
- What validation rules are mandatory?
- What are the filing deadlines and penalty rules?
- Who can access taxpayer data?
- What integrations exist (banking, identity, government systems)?

## Required artifacts
- `requirement.md` with compliance and validation constraints
- `functional-spec.md` for filing and audit workflows
- `technical-spec.md` covering encryption and access controls
- `docs/ARCHITECTURE.md` with data segregation and audit trails
- `test-plan.md` for validation accuracy and security

## Risk and compliance
- Sensitive financial data
- Regulatory compliance and auditability
- Fraud detection requirements

## Acceptance criteria examples
- All filings are validated against latest rules.
- Every data access is logged and auditable.
- Audit workflows can be triggered and tracked.

## Recommended outputs
- Filing validation engine
- Audit case management
- Compliance reporting

