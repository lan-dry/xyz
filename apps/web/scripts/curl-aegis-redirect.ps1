# Verify middleware handling for marketing /aegis on loopback.
# Run while the dev server is up: pnpm dev  (or pnpm start)
#
# Expected (local .env with PUBLIC_SITE_URL=http://localhost:3000):
#   HTTP/1.1 200 OK   (internal rewrite to /aegis — no Location header)
#   curl -sI does not follow rewrites; use the browser or curl -L for the full page.
#
# Production (salanor.com): 301/302 with Location: https://aegis.salanor.com/

$ErrorActionPreference = "Stop"
$url = if ($args[0]) { $args[0] } else { "http://localhost:3000/aegis" }

Write-Host "curl -sI $url"
Write-Host ""
$raw = curl.exe -sI $url 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "curl failed (exit $LASTEXITCODE). Is the dev server running on port 3000?"
}
Write-Host $raw

$locationLine = ($raw -split "`n" | Where-Object { $_ -match '^\s*Location:\s*' }) | Select-Object -First 1
if ($locationLine -match 'salanor\.com') {
  Write-Error @"
FAIL: Location header points at production salanor.com domain.
  $locationLine

This is a server/config bug on loopback, not a browser cache issue.
Expected: no Location to salanor.com (internal rewrite to /aegis).
See docs/CHROME_CACHED_REDIRECT.md
"@
}

if ($locationLine) {
  Write-Host ""
  Write-Host "Note: Location present but not salanor.com — $($locationLine.Trim())"
} else {
  Write-Host ""
  Write-Host "OK: no Location header to salanor.com (rewrite or 200)."
}
