# Transcript: Bug fix

User: sdd-tool hello
App: Welcome back. I found 2 active projects. Start new or continue?
User: New. I have a bug: https://example.com/issues/123
App: Do you approve opening that link?
User: Yes
App: Summary: Checkout crashes on submit in v2.4.1. Does that match your view?
User: Yes, it happens for some users on Safari.
App: Please describe expected vs actual behavior.
User: Expected: order is submitted. Actual: page crashes.
App: Steps to reproduce and environment details?
User: Add item, go to checkout, submit. Safari 16, macOS 13.
App: Severity and impact?
User: High. 20% of users.
App: Here are 5 possible fix paths:
1) Hotfix with Safari-specific workaround
2) Rollback to v2.3.9
3) Root-cause fix in payment module
4) Refactor event handler
5) Temporary fallback to server-side submit
Which path should we take?
User: Path 3
App: Approve moving to requirements and specs?
User: Yes
App: Generated requirement, technical spec, and test plan in backlog. Continue to planning?
