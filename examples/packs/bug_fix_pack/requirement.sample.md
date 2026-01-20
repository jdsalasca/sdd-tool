# Requirement: Checkout Crash on Safari

## ID
REQ-0201

## Objective
Stop Safari checkout crashes when submitting orders.

## Actors
Customers, checkout service

## Scope (in)
- Fix checkout submit crash
- Add regression test

## Scope (out)
- UI redesign

## Acceptance criteria
- Crash no longer reproducible on Safari
- Regression test added

## Non-functional requirements
- Security: no change
- Performance: no regression
- Availability: no downtime

## Constraints
- Must be hotfixable

## Risks
- Hidden regression in checkout flow

## Links
- https://example.com/issues/123
