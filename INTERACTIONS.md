# Interactions (human + app + AI)

This file defines the human interaction flow and how the app collaborates with Codex or other AI providers.

## Human interaction (hello)

1) App greets the user and detects intent.
2) App shows active projects and asks to resume or create new.
3) App asks the minimum mandatory questions for the selected flow.
4) App confirms scope and acceptance criteria.
5) App asks permission for any external link access.
6) App generates artifacts and asks for approval or `--improve`.

## App + AI interaction (Codex-ready)

### Provider-agnostic contract
- Input: structured prompt + context artifacts
- Output: structured response + reasoning summary + artifacts

### Prompt assembly
The app builds prompts using:
- User answers
- Flow script (router)
- Schema constraints
- Quality contract

### Self-audit and improve
- When `--improve` is used, the AI performs:
  - Completeness check
  - Ambiguity check
  - Consistency check
  - Quality check

### Human checkpoints
- After each major artifact, the app asks for approval.
- Rejection triggers refinement or `--improve`.

## Example: Bug report interaction

User: "I have a bug: <link>"
1) App asks permission to open link
2) App summarizes issue
3) App asks expected vs actual, repro steps, env, severity
4) App proposes 5+ options with trade-offs
5) User selects path
6) App generates requirements and specs
7) App asks approval to proceed

## Example: PR review interaction

User: "I have PR review comments"
1) App asks permission to open PR link
2) App summarizes comments and flags blockers
3) App runs comment audit (valid vs debatable)
4) App proposes responses and fixes
5) User approves plan or uses `--improve`
6) App generates specs and test plan

## Example: Learning mode interaction

User: "I want to learn about Egypt"
1) App interviews for depth, format, focus, time budget
2) App proposes research plan
3) User approves
4) App generates brief + deep-dive + reading list + QA

## Artifacts and routing

The router decides:
- Which questions to ask
- Which artifacts to generate
- Which gates apply
- Which agents are activated
