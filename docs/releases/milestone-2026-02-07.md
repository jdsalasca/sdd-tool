# Release Notes (v0.1.19..HEAD)

Generated: 2026-02-07T19:46:58.946Z

## Features
- **cli**: add jira import, monorepo scope, pr bridge, and release notes automation
- **import**: bootstrap autopilot from GitHub issue URLs (#48)
- **status**: add next-command recommendations (#44)
- **hello**: add beginner guidance mode for autopilot (#43)
- **onboarding**: add quickstart command and adoption roadmap tracker (#41)
- **cli**: add dry-run preview for hello autopilot (#37)
- **hello**: print recovery commands when autopilot stops (#35)
- **hello**: auto-guide default flow for direct intent input (#34)
- **autopilot**: add checkpoint resume and from-step recovery (#32)
- **cli**: add non-interactive mode for scriptable autopilot runs (#30)
- **hello**: add english-first guided narration for default autopilot (#27)
- **hello**: make default flow fully autopilot and guided (#25)
- **ux**: add beginner autopilot flow and integration coverage (#23)

## Docs
- **onboarding**: add first-15-min walkthrough and transcript (#46)
- add roadmap tracking and align docs with autopilot default flow (#29)

## CI
- add autopilot smoke matrix and docs consistency check (#39)

## Fixes
- harden workflow state transitions and runtime flags (#21)
- **prompt**: avoid blocking on non-tty stdin
