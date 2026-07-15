# Restore files from Cursor Local History (VS Code format) for d:\PROJECTS\salanor
# Usage: .\tools\scripts\recover-from-cursor-history.ps1
#        .\tools\scripts\recover-from-cursor-history.ps1 -DestRoot D:\PROJECTS\salanor-recovered

param(
  [string]$DestRoot = "D:\PROJECTS\salanor-recovered",
  [string]$HistoryRoot = "$env:APPDATA\Cursor\User\History",
  [string]$SourcePrefix = "D:\PROJECTS\salanor"
)

$ErrorActionPreference = "Stop"
$restored = 0
$skipped = 0
$missingBlob = 0

Write-Host "History: $HistoryRoot"
Write-Host "Restore to: $DestRoot"
Write-Host ""

if (-not (Test-Path $HistoryRoot)) {
  Write-Error "Cursor history folder not found: $HistoryRoot"
}

New-Item -ItemType Directory -Force -Path $DestRoot | Out-Null

function Get-LocalPathFromResource([string]$resource) {
  if (-not $resource) { return $null }
  $raw = [Uri]::UnescapeDataString($resource) -replace '^file://', ''
  $raw = $raw.TrimStart('/')
  $p = $raw -replace '/', '\'
  if ($p -match '^([a-zA-Z])(\\.*)

Get-ChildItem $HistoryRoot -Directory | ForEach-Object {
  $entriesFile = Join-Path $_.FullName "entries.json"
  if (-not (Test-Path $entriesFile)) { return }

  $meta = Get-Content $entriesFile -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
  if (-not $meta.resource) { return }

  $localPath = Get-LocalPathFromResource $meta.resource
  if (-not $localPath) { return }

  $norm = $localPath.Replace('/', '\')
  if ($norm -notlike "$SourcePrefix*") { return }

  $rel = $norm.Substring($SourcePrefix.Length).TrimStart('\')
  if (-not $rel) { return }

  $entries = @($meta.entries)
  if ($entries.Count -eq 0) { return }

  $latest = $entries | Sort-Object { [long]$_.timestamp } | Select-Object -Last 1
  $srcBlob = Join-Path $_.FullName $latest.id

  if (-not (Test-Path $srcBlob)) {
    $script:missingBlob++
    return
  }

  $destPath = Join-Path $DestRoot $rel
  $destDir = Split-Path $destPath -Parent
  if ($destDir -and -not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  }

  Copy-Item -LiteralPath $srcBlob -Destination $destPath -Force
  $script:restored++
}

Write-Host "Restored files: $restored"
Write-Host "Missing history blobs: $missingBlob"
Write-Host "Done. Open: $DestRoot"
) {
    return ($matches[1].ToUpper() + ':' + $matches[2])
  }
  if ($p -match '^([a-zA-Z]):\\') {
    return ($matches[1].ToUpper() + ':\' + $p.Substring(3))
  }
  return $p
}

Get-ChildItem $HistoryRoot -Directory | ForEach-Object {
  $entriesFile = Join-Path $_.FullName "entries.json"
  if (-not (Test-Path $entriesFile)) { return }

  $meta = Get-Content $entriesFile -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
  if (-not $meta.resource) { return }

  $localPath = Get-LocalPathFromResource $meta.resource
  if (-not $localPath) { return }

  $norm = $localPath.Replace('/', '\')
  if ($norm -notlike "$SourcePrefix*") { return }

  $rel = $norm.Substring($SourcePrefix.Length).TrimStart('\')
  if (-not $rel) { return }

  $entries = @($meta.entries)
  if ($entries.Count -eq 0) { return }

  $latest = $entries | Sort-Object { [long]$_.timestamp } | Select-Object -Last 1
  $srcBlob = Join-Path $_.FullName $latest.id

  if (-not (Test-Path $srcBlob)) {
    $script:missingBlob++
    return
  }

  $destPath = Join-Path $DestRoot $rel
  $destDir = Split-Path $destPath -Parent
  if ($destDir -and -not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  }

  Copy-Item -LiteralPath $srcBlob -Destination $destPath -Force
  $script:restored++
}

Write-Host "Restored files: $restored"
Write-Host "Missing history blobs: $missingBlob"
Write-Host "Done. Open: $DestRoot"
