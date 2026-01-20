# Router flow: PR review

## Entry signals
- "PR", "pull request", "review comments", "code review"

## Steps
1) Ask permission to open PR link.
2) Fetch PR details and comments (if approved).
3) Summarize comments and classify by severity.
4) Ask user to confirm understanding and add context.
5) Run prework audit: validate if comments are correct or debatable.
6) Propose fixes and alternatives.
7) Generate requirements/specs for the changes.
8) Gate implementation until test plan is defined.

## Required questions
- What is the PR link and target branch?
- Are there blocking comments?
- What tests are required?
- Is there any deadline or release window?

## Scripted Q/A tree

### Q1: Link access
Q: "Do you approve opening the PR link?"  
A: Yes -> fetch + summarize  
A: No -> ask for pasted comments

### Q2: User perspective
Q: "Do you agree with the comments? Any context we should know?"  
A: capture user insights

### Q3: Prework audit
Q: "Should we challenge or accept any comment? If so, why?"  
A: capture constraints and rationale

### Q4: Approval gate
Q: "Approve plan to address comments and generate specs?"  
A: Yes -> generate artifacts  
A: No -> refine

## Required outputs
- `requirement.md`
- `technical-spec.md`
- `test-plan.md`
- `progress-log.md`
- `pr-comment-audit.md`
- `pr-review-summary.md`

## Gates
- All comments reviewed before proposing fixes
- Test plan required before implementation

## Agents
- Reviewer, Tech Lead, QA
