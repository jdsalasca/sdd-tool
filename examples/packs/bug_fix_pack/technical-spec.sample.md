# Technical Spec: Checkout Crash on Safari

## Stack
- Web app

## Interfaces and contracts
- POST /checkout

## Data model
- orders(id, status, created_at)

## Security
- No changes

## Errors
- Fix null reference in submit handler

## Performance
- No regression

## Observability
- Add log for submit errors
