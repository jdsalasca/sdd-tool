# Functional Spec: Inventory Reservation API

## Overview
Provide reservation endpoints to prevent overselling.

## Actors
Warehouse staff, checkout service

## Use cases
- Create reservation
- Release reservation
- Expire reservation

## Flows
- Reserve -> hold -> expire

## Business rules
- Reservation expires after 30 minutes

## Errors and exceptions
- Insufficient stock returns 409

## Acceptance criteria
- Reservations prevent oversell
