# Test Plan: Inventory Reservation API

## Critical paths
- Create reservation with valid stock
- Release reservation
- Expire reservation after 30 minutes

## Edge cases
- Insufficient stock
- Duplicate reservation request

## Acceptance tests
- Reservation prevents oversell
- Expired reservation releases stock

## Regression tests
- Existing checkout flow still passes

## Coverage target
80%
