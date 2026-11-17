# PowerShell wrapper for demo:up (local stack: normal API, real timers, no demo mode)
$ErrorActionPreference = "Stop"
node "$PSScriptRoot/demo-up.mjs" @args
exit $LASTEXITCODE
