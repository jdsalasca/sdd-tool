# Technical Spec: Churn Prediction

## Stack
- Python
- Pandas
- Scikit-learn

## Interfaces and contracts
- Batch inference job

## Data model
- features(account_age, usage_30d, invoices_paid)

## Security
- Access limited to analytics role

## Errors
- Missing features returns error

## Performance
- Inference under 200ms

## Observability
- Drift metrics and alerting
