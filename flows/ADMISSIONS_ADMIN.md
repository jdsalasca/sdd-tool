# Flow: Admissions admin

## Goal
Manage applications, documents, approvals, and communication with clear audit trails.

## Discovery prompts
- What application stages exist (submitted, reviewed, approved, waitlist)?
- What documents are required and how are they verified?
- Who has approval authority and what rules apply?
- Are there quotas or priority rules?
- What integrations exist (email, CRM, identity verification)?

## Required artifacts
- `requirement.md` with eligibility and decision rules
- `functional-spec.md` for intake, review, and decision workflows
- `technical-spec.md` for document verification and notifications
- `docs/ARCHITECTURE.md` including workflow engine and queueing
- `test-plan.md` for fairness and correctness checks

## Risk and compliance
- Data privacy and retention
- Bias and fairness risks
- Auditability for decisions

## Acceptance criteria examples
- Every decision is traceable to a reviewer and criteria.
- Documents cannot be edited without history tracking.
- Applicants get status updates within defined time windows.

## Recommended outputs
- Application pipeline dashboard
- Document verification checklist
- Decision audit report

