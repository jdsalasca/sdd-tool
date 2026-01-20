#!/usr/bin/env bash
set -euo pipefail

PROJECT="${1:-}"
REQ_ID="${2:-}"

if [[ -z "$PROJECT" || -z "$REQ_ID" ]]; then
  echo "Usage: ./scripts/e2e.sh <project> <REQ-ID>"
  exit 1
fi

npm run build >/dev/null

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
