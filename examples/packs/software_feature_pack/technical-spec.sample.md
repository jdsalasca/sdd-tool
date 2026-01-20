# Technical Spec: Inventory Reservation API

## Stack
- Node.js
- PostgreSQL
- Redis

## Interfaces and contracts
- POST /reservations
- DELETE /reservations/{id}

## Data model
- reservations(id, sku, qty, expires_at, status)

## Security
- RBAC for reservation endpoints

## Errors
- 409 insufficient stock
- 404 missing reservation

## Performance
- 1000 rps sustained

## Observability
- Reservation lifecycle logs
