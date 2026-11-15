# PowerShell wrapper for demo:up
$ErrorActionPreference = "Stop"
if (-not $env:AEGIS_DEMO_APPROVAL_PASSWORD) {
  Write-Error "Set AEGIS_DEMO_APPROVAL_PASSWORD (min 10 chars). No default."
  exit 1
}
$env:AEGIS_DEMO_MODE = "true"
node "$PSScriptRoot/demo-up.mjs"
