# First 15 Minutes Onboarding

This walkthrough helps a new user get value quickly using the default autopilot flow.

## Goal

In one short session, create and complete a requirement with minimal manual steps.

## Path A: Fastest path (recommended)

1. Install:
   - `npm install -g sdd-cli`
2. Run:
   - `sdd-cli quickstart --example saas`
3. Confirm completion:
   - Look for `Autopilot completed successfully` in terminal output.
4. Inspect generated artifacts:
   - `<workspace>/<project>/requirements/done/<REQ-ID>/`

Expected duration: ~2-5 minutes depending on machine speed.

## Path B: Guided beginner path

1. Start guided mode:
   - `sdd-cli --beginner hello "Build onboarding for first-time users"`
2. Follow beginner hints printed during each autopilot stage.
3. If interrupted, resume using suggested command:
   - `sdd-cli --project "<name>" --from-step <step> hello "resume"`
4. If unsure what to run next:
   - `sdd-cli --project "<name>" status --next`

Expected duration: ~5-15 minutes including review.

## Transcript reference

- Full first-run transcript:
  - `examples/transcripts/FIRST_15_MINUTES.md`

## Optional visual recording workflow

You can generate and attach a short GIF for docs updates:

1. Record terminal run with your preferred recorder.
2. Keep clip under 45 seconds.
3. Include:
   - command executed
   - key progress lines
   - completion message
4. Store asset at:
   - `docs/assets/first-15-minutes.gif`
