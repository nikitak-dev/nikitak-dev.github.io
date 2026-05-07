# vapi-evals/create-suite.ps1
#
# One-time setup: register the test suite in Vapi.
# Two-step flow per Vapi API:
#   1. POST /test-suite with {name} -> returns suite ID
#   2. For each test in suite-definition.json, POST to /test-suite/{id}/test
# After running, the returned suite ID is saved to .suite-id (gitignored).
#
# Re-running creates a NEW suite (Vapi does not deduplicate by name) - only run
# once unless the suite definition changes structurally.
#
# Prereqs:
#   $env:VAPI_PRIVATE_TOKEN - a Vapi private API key (Vapi Dashboard -> Profile
#     -> API Keys -> private). Kept as Windows User env var by default.
#   $env:VAPI_ASSISTANT_ID  - target assistant for all test cases. Loaded from
#     repo-root .env if not already set in shell.
#
# Repo-root .env loader (does not override existing process / User-level vars).

$ErrorActionPreference = 'Stop'

$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
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

# Read JSON as UTF-8 bytes - default Get-Content on Windows uses ANSI codepage,
# which corrupts em-dashes / unicode chars and produces a 400 from Vapi.
$jsonBytes = [System.IO.File]::ReadAllBytes((Join-Path $here 'suite-definition.json'))
$json = [System.Text.Encoding]::UTF8.GetString($jsonBytes)
# Substitute ${VAPI_ASSISTANT_ID} placeholders before parsing.
$json = $json.Replace('${VAPI_ASSISTANT_ID}', $env:VAPI_ASSISTANT_ID)
$definition = $json | ConvertFrom-Json

$headers = @{
  Authorization  = "Bearer $($env:VAPI_PRIVATE_TOKEN)"
  'Content-Type' = 'application/json; charset=utf-8'
}

# Step 1: Create suite with name + targetPlan (assistant binding required for /run)
$suitePayload = @{
  name       = $definition.name
  targetPlan = @{ assistantId = $definition._assistantId_for_runs }
} | ConvertTo-Json -Compress -Depth 5
$suitePayloadBytes = [System.Text.Encoding]::UTF8.GetBytes($suitePayload)

"Creating suite '$($definition.name)' bound to assistant $($definition._assistantId_for_runs)..."
$suite = Invoke-RestMethod `
  -Uri 'https://api.vapi.ai/test-suite' `
  -Method Post `
  -Headers $headers `
  -Body $suitePayloadBytes `
  -UseBasicParsing

$suiteId = $suite.id
"Suite ID: $suiteId"

# Step 2: Add each test case
$testCount = $definition.tests.Count
"Adding $testCount test case(s)..."

foreach ($test in $definition.tests) {
  $testPayload = $test | ConvertTo-Json -Depth 10 -Compress
  $testPayloadBytes = [System.Text.Encoding]::UTF8.GetBytes($testPayload)

  "  - $($test.name)"
  $created = Invoke-RestMethod `
    -Uri "https://api.vapi.ai/test-suite/$suiteId/test" `
    -Method Post `
    -Headers $headers `
    -Body $testPayloadBytes `
    -UseBasicParsing

  "    test ID: $($created.id)"
}

# Save suite ID for run-suite.ps1
$suiteId | Out-File -FilePath (Join-Path $here '.suite-id') -NoNewline -Encoding ASCII

"---"
"Suite created with ID: $suiteId"
"Test cases added: $testCount"
"Saved ID to .suite-id - re-run run-suite.ps1 to trigger an evaluation."
