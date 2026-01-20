# Technical Spec: Churn Prediction Model

## Stack
- Python
- Pandas
- Scikit-learn

## Interfaces and contracts
- Batch inference job
- REST endpoint for predictions

## Data model
- features(account_age, usage_30d, invoices_paid, support_tickets)

## Security
- Access limited to analytics role

## Errors
- 400 on missing features
- 500 on model load failure

## Performance
- Inference under 200ms

## Observability
- Model drift dashboard
- Prediction latency metrics
