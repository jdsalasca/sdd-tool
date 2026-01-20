# Flow: Bug fix

## Goal
Diagnose, fix, and verify a production or QA bug with minimal regression risk.

## Discovery prompts
- What is the exact observed behavior?
- What is the expected behavior?
- Steps to reproduce (deterministic if possible)
- Environment details (version, OS, data)
- Impact and severity

## Required artifacts
- `requirement.md` with bug description and scope
- `functional-spec.md` focusing on expected behavior
- `technical-spec.md` with root cause and fix strategy
- `test-plan.md` with repro and regression checks

## Risk and compliance
- Hidden dependencies and regressions
- Data corruption risk
- SLA impact

## Acceptance criteria examples
- Bug can no longer be reproduced.
- No regressions in related flows.
- A regression test is added.

## Recommended outputs
- Root cause analysis
- Fix plan
- Rollback plan if needed
