# Flow to gate map

This table ensures each flow triggers required gates and prompt packs.

| Flow | Gates | Prompt packs |
|---|---|---|
| BUG_FIX | repro_steps_defined, acceptance_criteria_defined | bug_fix.core, discovery.core |
| SOFTWARE_FEATURE | objective_defined, scope_defined, acceptance_criteria_defined, nfrs_defined, test_plan_defined, rollout_defined | discovery.core, release.rollout |
| PR_REVIEW | comment_audit_complete, test_plan_defined, comment_severity_defined | pr_review.core, review.severity |
| DATA_SCIENCE | objective_defined, nfrs_defined, test_plan_defined, monitoring_defined | discovery.core, data.monitoring |
| DESIGN | objective_defined, scope_defined, acceptance_criteria_defined, accessibility_defined | discovery.core, design.accessibility |
| LEARN | scope_defined, learning_format_defined | discovery.core, learn.format |
| HUMANITIES | objective_defined, scope_defined, source_quality_defined | discovery.core, humanities.sources |
| BUSINESS | objective_defined, scope_defined, sensitivity_defined | discovery.core, business.sensitivity |
| LEGAL | objective_defined, compliance_defined | discovery.core, legal.compliance |
| GENERIC | objective_defined | discovery.core |
