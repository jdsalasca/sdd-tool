# Transcript: Software feature

User: sdd-cli hello
App: New or continue?
User: New. I want to build an API for inventory reservations.
App: Who is the user and what problem are we solving?
User: Warehouse staff need to reserve stock to avoid overselling.
App: What is in scope and out of scope?
User: In scope: reserve/release endpoints. Out: payment integration.
App: Acceptance criteria?
User: Reservations expire after 30 minutes and prevent oversell.
App: Performance or security constraints?
User: Must handle 1k rps, role-based access only.
App: Rollout and success metrics?
User: 99.9% success rate, zero oversell incidents.
App: Approve requirements and move to specs?
User: Yes
App: Requirements and specs generated. Continue to architecture?

