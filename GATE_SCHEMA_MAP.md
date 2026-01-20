# Gate to schema map

This table links gates to required schema fields.

| Gate | Schema | Fields |
|---|---|---|
| objective_defined | requirement.schema.json | objective |
| scope_defined | requirement.schema.json | scope.in, scope.out |
| acceptance_criteria_defined | requirement.schema.json | acceptanceCriteria |
| nfrs_defined | requirement.schema.json | nfrs |
| test_plan_defined | test-plan.schema.json | criticalPaths, edgeCases, acceptanceTests |
| quality_thresholds_defined | quality.schema.json | thresholds |
| repro_steps_defined | requirement.schema.json | links or description |
| comment_audit_complete | pr-review.schema.json | audit.valid, audit.debatable |
