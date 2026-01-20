param(
  [string]$Project,
  [string]$ReqId
)

if (-not $Project) {
  Write-Host "Usage: .\\scripts\\e2e.ps1 -Project <name> [-ReqId <REQ-...>]"
  exit 1
}

npm run build | Out-Null

if (-not $ReqId) {
  $createInput = @"
$Project
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
"@
  $createOutput = $createInput | node dist/cli.js req create
  $ReqId = $createOutput |
    Select-String -Pattern "requirements[\\/]+backlog[\\/]+([^\\/]+)" |
    ForEach-Object { $_.Matches[0].Groups[1].Value } |
    Select-Object -Last 1
  if (-not $ReqId) {
    Write-Host "Failed to detect REQ-ID from create output."
    Write-Host $createOutput
    exit 1
  }
}

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
