# Flow: Court system

## Goal
Manage case intake, hearings, rulings, and records with strict auditability and compliance.

## Discovery prompts
- What case types and jurisdictions are included?
- What rules govern access and privacy?
- What is the expected SLA for filings and responses?
- What are the archival and retention requirements?
- What integrations exist with external justice systems?

## Required artifacts
- `requirement.md` with legal constraints and actors
- `functional-spec.md` for filing, scheduling, and ruling flows
- `technical-spec.md` for access control and audit logs
- `architecture.md` for resiliency and record management
- `test-plan.md` for permissions and compliance verification

## Risk and compliance
- Evidence integrity and chain of custody
- Unauthorized access risks
- Retention and public records compliance

## Acceptance criteria examples
- All case actions are logged and immutable.
- Access is enforced by role and jurisdiction.
- Records can be produced for audit in minutes.

## Recommended outputs
- Court docket workflow
- Evidence chain-of-custody log
- Compliance audit pack
