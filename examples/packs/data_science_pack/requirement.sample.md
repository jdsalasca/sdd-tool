# Requirement: Churn Prediction

## ID
REQ-0301

## Objective
Predict churn with AUC >= 0.85.

## Actors
Data science team, product team

## Scope (in)
- Model training
- Batch inference

## Scope (out)
- Real-time inference

## Acceptance criteria
- AUC >= 0.85
- Inference under 200ms

## Non-functional requirements
- Security: restricted access to customer data
- Performance: inference under 200ms
- Availability: 99.5%

## Constraints
- Must use existing CRM data

## Risks
- Bias against small accounts

## Links
- https://example.com/ml/churn
