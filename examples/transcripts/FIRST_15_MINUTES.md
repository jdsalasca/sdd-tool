# Transcript: First 15 Minutes

This transcript shows a realistic first run for a new user.

## Session 1: Quickstart (fast path)

```text
> sdd-cli quickstart --example saas
Running quickstart example: saas
Hello from sdd-cli.
Workspace: C:\Users\<user>\AppData\Roaming\sdd-cli\workspaces
  -> Auto-guided mode active: using current workspace defaults.
No active projects found.
Detected intent: software feature -> SOFTWARE_FEATURE
Step 1/7: Intent detected
  -> I classified your goal and selected the best starting flow.
Step 2/7: Requirement setup
  -> I will gather enough context to generate a valid first draft.
  -> Using project: autopilot-build-a-saas-onboarding-20260207
Step 3/7: Creating requirement draft automatically
Step 4/7: Planning requirement REQ-0001
Step 5/7: Preparing implementation plan for REQ-0001
Step 6/7: Updating test plan for REQ-0001
Step 7/7: Finalizing requirement REQ-0001
Autopilot completed successfully for REQ-0001.
Artifacts finalized at: ...\requirements\done\REQ-0001
```

## Session 2: Beginner mode (guided path)

```text
> sdd-cli --beginner hello "Build onboarding for first-time users"
Hello from sdd-cli.
Workspace: C:\Users\<user>\AppData\Roaming\sdd-cli\workspaces
  [Beginner] I will explain each step and tell you what happens next.
  -> Auto-guided mode active: using current workspace defaults.
Active projects:
- autopilot-build-a-saas-onboarding-20260207 (done)
Auto-selected: new flow.
Detected intent: software feature -> SOFTWARE_FEATURE
Step 1/7: Intent detected
  [Beginner] Intent helps me pick the right workflow and defaults.
Step 2/7: Requirement setup
  [Beginner] A requirement draft defines scope, acceptance criteria, and constraints.
...
Autopilot completed successfully for REQ-0002.
```

## Session 3: "What should I run now?"

```text
> sdd-cli --project "autopilot-build-a-saas-onboarding-20260207" status --next
Project: autopilot-build-a-saas-onboarding-20260207
- backlog: 0
- wip: 0
- in-progress: 0
- done: 1
- archived: 0
Next command: sdd-cli --project "autopilot-build-a-saas-onboarding-20260207" hello "start next requirement"
```
