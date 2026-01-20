#!/usr/bin/env bash
set -euo pipefail

PROJECT="${1:-}"
REQ_ID="${2:-}"

if [[ -z "$PROJECT" ]]; then
  echo "Usage: ./scripts/e2e.sh <project> [REQ-ID]"
  exit 1
fi

npm run build >/dev/null

if [[ -z "$REQ_ID" ]]; then
  CREATE_OUTPUT=$(cat <<EOF | node dist/cli.js req create
$PROJECT
software
E2E requirement
scope in
scope out
acceptance
security
performance
availability
constraints
risks
links
EOF
)
  REQ_ID=$(echo "$CREATE_OUTPUT" | sed -n 's|.*requirements/backlog/\\([^/]*\\).*|\\1|p' | tail -n 1)
  if [[ -z "$REQ_ID" ]]; then
    echo "Failed to detect REQ-ID from create output."
    echo "$CREATE_OUTPUT"
    exit 1
  fi
fi

cat <<EOF | node dist/cli.js req plan
$PROJECT
$REQ_ID
Overview
use case
rule
error
accept
node
POST /x
data
sec
err
perf
obs
context
container
component
deploy
context.mmd
critical
edge
accept test
regress
80%
EOF

cat <<EOF | node dist/cli.js req start
$PROJECT
$REQ_ID
milestone
task
dep
risk
EOF

cat <<EOF | node dist/cli.js req finish
$PROJECT
$REQ_ID
overview
how to run
arch summary
test notes
EOF

node dist/cli.js doctor "$PROJECT" "$REQ_ID"
