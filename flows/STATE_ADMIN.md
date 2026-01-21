# Flow: State administration

## Goal
Deliver reliable public services with strict compliance, transparency, and audit trails.

## Discovery prompts
- What service is being delivered (permits, benefits, licenses)?
- What laws and regulations apply?
- What are the SLA requirements for response times?
- Who are the actors (citizens, clerks, supervisors)?
- What data must be retained and for how long?

## Required artifacts
- `requirement.md` with legal constraints and SLA targets
- `functional-spec.md` for service request and approval flows
- `technical-spec.md` for identity and access management
- `docs/ARCHITECTURE.md` for resiliency and data governance
- `test-plan.md` for SLA compliance and failure scenarios

## Risk and compliance
- Legal compliance and transparency
- Accessibility for public services
- Disaster recovery requirements

## Acceptance criteria examples
- Requests are tracked end-to-end with timestamps.
- Service availability meets SLA targets.
- Decisions can be audited by authorized parties.

## Recommended outputs
- Citizen request tracking
- Compliance dashboard
- Audit-ready reports

