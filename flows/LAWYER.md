# Flow: Lawyer (legal practice)

## Goal
Build a system to manage cases, documents, deadlines, and client communication with strong audit trails.

## Discovery prompts
- What case types are supported (civil, criminal, corporate)?
- What jurisdictions and compliance rules apply?
- What data is sensitive or privileged?
- Who are the actors (partners, associates, paralegals, clients)?
- What are the legal deadlines and escalation rules?

## Required artifacts
- `requirement.md` with scope and compliance constraints
- `functional-spec.md` including case lifecycle and document review flows
- `technical-spec.md` detailing access control and audit logging
- `docs/ARCHITECTURE.md` with secure storage and encryption at rest
- `test-plan.md` with permission boundary tests
- `decision-log/ADR-XXXX.md` for storage and retention choices

## Risk and compliance
- Data confidentiality (client privilege)
- Retention and legal hold policies
- Audit trails for all access and edits

## Acceptance criteria examples
- Every document access is logged with user, timestamp, and reason.
- Retention rules can be configured per case type.
- Access is role-based and least-privilege by default.

## Recommended outputs
- Secure storage and audit module
- Role-based access matrix
- Case timeline dashboard

