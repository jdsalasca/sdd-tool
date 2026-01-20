# Technical Spec: Case Management Workflow

## Stack
- Web app
- Postgres

## Interfaces and contracts
- Case API
- Document API

## Data model
- cases(id, status)
- documents(id, case_id, type)

## Security
- RBAC
- Audit logging

## Errors
- Missing document

## Performance
- 500 concurrent users

## Observability
- Access logs
