# Requirement: Inventory Reservation API

## ID
REQ-0007

## Objective
Prevent overselling by reserving stock for checkout.

## Actors
Warehouse staff, checkout service

## Scope (in)
- Create reservation
- Release reservation
- Expire reservations after 30 minutes

## Scope (out)
- Payment integration

## Acceptance criteria
- Reservation created in under 200ms.
- Stock is not oversold.
- Reservations expire automatically.

## Non-functional requirements
- Security: RBAC for reservation endpoints
- Performance: 1000 rps sustained
- Availability: 99.9%

## Constraints
- Must work with existing inventory DB

## Risks
- Stale inventory data

## Links
- https://example.com/issue/77
