# Issue Triage Playbook

This playbook defines how to triage issues consistently for community contributors.

## Label taxonomy

Type:
- `bug`
- `feature`
- `docs`
- `chore`
- `tests`

Priority:
- `priority:p0`
- `priority:p1`
- `priority:p2`

Area:
- `area:hello`
- `area:req`
- `area:pr`
- `area:release`
- `area:docs`
- `area:infra`

Experience:
- `good first issue`
- `help wanted`

## Triage workflow

1. Confirm reproducibility and expected behavior.
2. Assign one `type` label.
3. Assign one `priority` label.
4. Assign at least one `area` label.
5. If beginner-friendly, add `good first issue`.
6. Add acceptance criteria in issue description.

## Priority rules

- `priority:p0`: broken core flow, release blocker, data loss, security issue.
- `priority:p1`: significant UX/reliability gap without data loss.
- `priority:p2`: incremental improvements and non-urgent refinements.

## Acceptance criteria template

Use this checklist in issue body:

- [ ] Repro steps are explicit.
- [ ] Expected outcome is explicit.
- [ ] Scope boundaries are explicit.
- [ ] Validation command(s) are listed.

## Escalation

Escalate immediately to maintainers if issue involves:
- security vulnerability
- release pipeline breakage
- irreversible data corruption
