param(
  [string]$Project,
  [string]$ReqId
)

if (-not $Project -or -not $ReqId) {
  Write-Host "Usage: .\\scripts\\e2e.ps1 -Project <name> -ReqId <REQ-...>"
  exit 1
}

npm run build | Out-Null

$plan = @"
$Project
$ReqId
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
"@

$plan | node dist/cli.js req plan

$start = @"
$Project
$ReqId
milestone
task
dep
risk
"@

$start | node dist/cli.js req start

$finish = @"
$Project
$ReqId
overview
how to run
arch summary
test notes
"@

$finish | node dist/cli.js req finish

node dist/cli.js doctor $Project $ReqId
