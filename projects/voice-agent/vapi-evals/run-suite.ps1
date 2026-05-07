# vapi-evals/run-suite.ps1
#
# Trigger one evaluation run via /eval/simulation/run, poll until completion,
# save the final result JSON to results/<timestamp>.json, print a summary.
#
# Each run executes ALL test cases in the suite against the assistant whose
# id is in suite-definition.json under _assistantId_for_runs. Test cases run
# in chat mode (vapi.webchat transport) - text-only, no real phone call,
# no TTS/STT, no audio recording. Mutating tool calls (create_client,
# book_event) DO fire against production n8n + Postgres - clean up
# afterwards with cleanup-test-data.sql.
#
# Prereq: $env:VAPI_PRIVATE_TOKEN set + create-suite.ps1 has been run
# (.suite-id exists).

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Repo-root .env loader (does not override existing process / User-level vars).
$envFile = Join-Path $here '..\..\..\.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
    if (-not [System.Environment]::GetEnvironmentVariable($k, 'Process')) {
      [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
  }
}

if (-not $env:VAPI_PRIVATE_TOKEN) {
  Write-Error 'VAPI_PRIVATE_TOKEN env var not set. Set it as Windows User env var or in repo-root .env.'
  exit 1
}
if (-not $env:VAPI_ASSISTANT_ID) {
  Write-Error 'VAPI_ASSISTANT_ID env var not set. Add it to repo-root .env (see .env.example).'
  exit 1
}

$suiteIdFile = Join-Path $here '.suite-id'
if (-not (Test-Path $suiteIdFile)) {
  Write-Error '.suite-id not found. Run create-suite.ps1 first.'
  exit 1
}

$suiteId = (Get-Content $suiteIdFile -Raw).Trim()
$assistantId = $env:VAPI_ASSISTANT_ID

$headers = @{
  Authorization  = "Bearer $($env:VAPI_PRIVATE_TOKEN)"
  'Content-Type' = 'application/json; charset=utf-8'
}

# /test-suite/{id}/run rejects assistantId at top level.
# Try empty body - the suite may carry the assistant binding internally.
$runPayloadBytes = [System.Text.Encoding]::UTF8.GetBytes('{}')

"Triggering test-suite run for suite $suiteId ..."
$run = Invoke-RestMethod `
  -Uri "https://api.vapi.ai/test-suite/$suiteId/run" `
  -Method Post `
  -Headers $headers `
  -Body $runPayloadBytes `
  -UseBasicParsing

$runId = $run.id
"Run created: $runId"
"Polling for completion (~30s-3min depending on scenario count and LLM latency)..."

# Poll until terminal status — 30s interval to avoid Vapi rate-limit
$pollIntervalSeconds = 30
$maxIterations = 30   # cap at ~15 min total
$status = $null

for ($i = 0; $i -lt $maxIterations; $i++) {
  Start-Sleep -Seconds $pollIntervalSeconds
  $status = Invoke-RestMethod `
    -Uri "https://api.vapi.ai/test-suite/$suiteId/run/$runId" `
    -Headers $headers `
    -UseBasicParsing

  "  [$($i * $pollIntervalSeconds)s] status: $($status.status)"

  if ($status.status -in @('completed', 'ended', 'failed', 'cancelled')) {
    break
  }
}

# Save full result
$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$resultFile = Join-Path $here "results\$timestamp.json"
$status | ConvertTo-Json -Depth 20 | Out-File -FilePath $resultFile -Encoding UTF8

# Summary
"---"
"Final status: $($status.status)"
if ($status.itemCounts) {
  "Passed: $($status.itemCounts.passed)"
  "Failed: $($status.itemCounts.failed)"
  "Total:  $($status.itemCounts.total)"
}
"Full result saved to: results\$timestamp.json"
"---"
"Next: review per-case scores in the saved JSON, then run cleanup-test-data.sql"
"      via Supabase MCP / Studio to remove test rows from calls / consent_log /"
"      customers / appointments."

if ($status.itemCounts -and $status.itemCounts.failed -gt 0) {
  exit 1
}
