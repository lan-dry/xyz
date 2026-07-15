# End-to-end onboarding test (local). Requires: postgres, aegis-api :8080, id :8091
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)

$secret = $env:PLATFORM_BOOTSTRAP_SECRET
if (-not $secret) { throw "PLATFORM_BOOTSTRAP_SECRET not set" }

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$slug = "pilot-org-$ts"
$adminEmail = "admin-$ts@test.salanor.local"
$memberEmail = "engineer-$ts@test.salanor.local"
$adminPass = "PilotAdmin1!"
$memberPass = "PilotMember1!"
$idBase = "http://127.0.0.1:8091/v1/id"
$consoleBase = "http://127.0.0.1:8080/v1/console"

function Parse-CookieHeader([string]$setCookie) {
  if ($setCookie -match 'salanor_session=([^;]+)') { return $matches[1] }
  if ($setCookie -match 'aegis_session=([^;]+)') { return $matches[1] }
  return $null
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "== 1. Provision organization + admin =="
$provBody = @{
  name = "Pilot Org $ts"
  slug = $slug
  admin_email = $adminEmail
  admin_password = $adminPass
} | ConvertTo-Json
$prov = Invoke-WebRequest -Uri "$idBase/platform/organizations" -Method POST `
  -Headers @{ "X-Platform-Secret" = $secret; "Content-Type" = "application/json" } `
  -Body $provBody -UseBasicParsing
if ($prov.StatusCode -ne 200) { throw "Provision failed: $($prov.Content)" }
$org = $prov.Content | ConvertFrom-Json
Write-Host "OK org_id=$($org.organization_id) admin=$($org.admin_email)"

Write-Host "== 2. Admin login (Salanor ID) =="
$login = Invoke-WebRequest -Uri "$idBase/auth/login" -Method POST -WebSession $session `
  -ContentType "application/json" -Body (@{ email = $adminEmail; password = $adminPass } | ConvertTo-Json) -UseBasicParsing
if ($login.StatusCode -ne 200) { throw "Login failed: $($login.Content)" }
$me = $login.Content | ConvertFrom-Json
Write-Host "OK role=$($me.user.role) org=$($me.organization.name)"

Write-Host "== 3. Console API as admin (via session cookie) =="
$traces = Invoke-WebRequest -Uri "$consoleBase/traces" -WebSession $session -UseBasicParsing
$traceData = $traces.Content | ConvertFrom-Json
Write-Host "OK traces count=$($traceData.traces.Count) (expect 0 for new org)"

Write-Host "== 4. Invite engineer =="
$orgId = $me.organization.organization_id
$inv = Invoke-WebRequest -Uri "$idBase/orgs/$orgId/invitations" -Method POST -WebSession $session `
  -ContentType "application/json" -Body (@{ email = $memberEmail; role = "engineer" } | ConvertTo-Json) -UseBasicParsing
if ($inv.StatusCode -ne 200) { throw "Invite failed: $($inv.Content)" }
$invData = $inv.Content | ConvertFrom-Json
$inviteUrl = $invData.invite_url
Write-Host "OK invite_url=$inviteUrl"
if ($inviteUrl -notmatch 'token=([^&]+)') { throw "No token in invite_url" }
$token = [uri]::UnescapeDataString($matches[1])

Write-Host "== 5. Preview invite =="
$preview = Invoke-WebRequest -Uri "$idBase/invitations/preview?token=$([uri]::EscapeDataString($token))" -UseBasicParsing
$prev = $preview.Content | ConvertFrom-Json
Write-Host "OK has_account=$($prev.has_account) role=$($prev.invitation.role)"

Write-Host "== 6. Signup-accept (new account) =="
$memberSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$accept = Invoke-WebRequest -Uri "$idBase/invitations/signup-accept" -Method POST -WebSession $memberSession `
  -ContentType "application/json" -Body (@{ token = $token; password = $memberPass; display_name = "Pilot Engineer" } | ConvertTo-Json) -UseBasicParsing
if ($accept.StatusCode -ne 200) { throw "Signup-accept failed: $($accept.Content)" }
$memberMe = $accept.Content | ConvertFrom-Json
Write-Host "OK member role=$($memberMe.user.role) org=$($memberMe.organization.name)"

Write-Host "== 7. Member console: traces (read) =="
$tr2 = Invoke-WebRequest -Uri "$consoleBase/traces" -WebSession $memberSession -UseBasicParsing
Write-Host "OK member can list traces"

Write-Host "== 8. Admin creates API key =="
$keyRes = Invoke-WebRequest -Uri "$consoleBase/ingest-keys" -Method POST -WebSession $session `
  -ContentType "application/json" -Body (@{ name = "e2e-key" } | ConvertTo-Json) -UseBasicParsing
if ($keyRes.StatusCode -ne 201) { throw "Create key failed: $($keyRes.Content)" }
$keyData = $keyRes.Content | ConvertFrom-Json
$ingestSecret = $keyData.secret
Write-Host "OK key_prefix=$($keyData.key.key_prefix) (secret returned once)"

Write-Host "== 9. Policies list (member) =="
$pol = Invoke-WebRequest -Uri "$consoleBase/policies" -WebSession $memberSession -UseBasicParsing
$polData = $pol.Content | ConvertFrom-Json
Write-Host "OK policies count=$($polData.policies.Count)"

Write-Host "== 10. Audit logs =="
$logs = Invoke-WebRequest -Uri "$consoleBase/audit-logs" -WebSession $memberSession -UseBasicParsing
$logData = $logs.Content | ConvertFrom-Json
Write-Host "OK audit logs count=$($logData.logs.Count)"

Write-Host "`n=== E2E PASSED ==="
Write-Host "Admin: $adminEmail / $adminPass"
Write-Host "Member: $memberEmail / $memberPass"
Write-Host "Console: http://localhost:3000/login"
) {
      [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
    }
  }
}

$secret = $env:PLATFORM_BOOTSTRAP_SECRET
if (-not $secret) { throw "PLATFORM_BOOTSTRAP_SECRET not set" }

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$slug = "pilot-org-$ts"
$adminEmail = "admin-$ts@test.salanor.local"
$memberEmail = "engineer-$ts@test.salanor.local"
$adminPass = "PilotAdmin1!"
$memberPass = "PilotMember1!"
$idBase = "http://127.0.0.1:8091/v1/id"
$consoleBase = "http://127.0.0.1:8080/v1/console"

function Parse-CookieHeader([string]$setCookie) {
  if ($setCookie -match 'salanor_session=([^;]+)') { return $matches[1] }
  if ($setCookie -match 'aegis_session=([^;]+)') { return $matches[1] }
  return $null
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "== 1. Provision organization + admin =="
$provBody = @{
  name = "Pilot Org $ts"
  slug = $slug
  admin_email = $adminEmail
  admin_password = $adminPass
} | ConvertTo-Json
$prov = Invoke-WebRequest -Uri "$idBase/platform/organizations" -Method POST `
  -Headers @{ "X-Platform-Secret" = $secret; "Content-Type" = "application/json" } `
  -Body $provBody -UseBasicParsing
if ($prov.StatusCode -ne 200) { throw "Provision failed: $($prov.Content)" }
$org = $prov.Content | ConvertFrom-Json
Write-Host "OK org_id=$($org.organization_id) admin=$($org.admin_email)"

Write-Host "== 2. Admin login (Salanor ID) =="
$login = Invoke-WebRequest -Uri "$idBase/auth/login" -Method POST -WebSession $session `
  -ContentType "application/json" -Body (@{ email = $adminEmail; password = $adminPass } | ConvertTo-Json) -UseBasicParsing
if ($login.StatusCode -ne 200) { throw "Login failed: $($login.Content)" }
$me = $login.Content | ConvertFrom-Json
Write-Host "OK role=$($me.user.role) org=$($me.organization.name)"

Write-Host "== 3. Console API as admin (via session cookie) =="
$traces = Invoke-WebRequest -Uri "$consoleBase/traces" -WebSession $session -UseBasicParsing
$traceData = $traces.Content | ConvertFrom-Json
Write-Host "OK traces count=$($traceData.traces.Count) (expect 0 for new org)"

Write-Host "== 4. Invite engineer =="
$orgId = $me.organization.organization_id
$inv = Invoke-WebRequest -Uri "$idBase/orgs/$orgId/invitations" -Method POST -WebSession $session `
  -ContentType "application/json" -Body (@{ email = $memberEmail; role = "engineer" } | ConvertTo-Json) -UseBasicParsing
if ($inv.StatusCode -ne 200) { throw "Invite failed: $($inv.Content)" }
$invData = $inv.Content | ConvertFrom-Json
$inviteUrl = $invData.invite_url
Write-Host "OK invite_url=$inviteUrl"
if ($inviteUrl -notmatch 'token=([^&]+)') { throw "No token in invite_url" }
$token = [uri]::UnescapeDataString($matches[1])

Write-Host "== 5. Preview invite =="
$preview = Invoke-WebRequest -Uri "$idBase/invitations/preview?token=$([uri]::EscapeDataString($token))" -UseBasicParsing
$prev = $preview.Content | ConvertFrom-Json
Write-Host "OK has_account=$($prev.has_account) role=$($prev.invitation.role)"

Write-Host "== 6. Signup-accept (new account) =="
$memberSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$accept = Invoke-WebRequest -Uri "$idBase/invitations/signup-accept" -Method POST -WebSession $memberSession `
  -ContentType "application/json" -Body (@{ token = $token; password = $memberPass; display_name = "Pilot Engineer" } | ConvertTo-Json) -UseBasicParsing
if ($accept.StatusCode -ne 200) { throw "Signup-accept failed: $($accept.Content)" }
$memberMe = $accept.Content | ConvertFrom-Json
Write-Host "OK member role=$($memberMe.user.role) org=$($memberMe.organization.name)"

Write-Host "== 7. Member console: traces (read) =="
$tr2 = Invoke-WebRequest -Uri "$consoleBase/traces" -WebSession $memberSession -UseBasicParsing
Write-Host "OK member can list traces"

Write-Host "== 8. Admin creates API key =="
$keyRes = Invoke-WebRequest -Uri "$consoleBase/ingest-keys" -Method POST -WebSession $session `
  -ContentType "application/json" -Body (@{ name = "e2e-key" } | ConvertTo-Json) -UseBasicParsing
if ($keyRes.StatusCode -ne 201) { throw "Create key failed: $($keyRes.Content)" }
$keyData = $keyRes.Content | ConvertFrom-Json
$ingestSecret = $keyData.secret
Write-Host "OK key_prefix=$($keyData.key.key_prefix) (secret returned once)"

Write-Host "== 9. Policies list (member) =="
$pol = Invoke-WebRequest -Uri "$consoleBase/policies" -WebSession $memberSession -UseBasicParsing
$polData = $pol.Content | ConvertFrom-Json
Write-Host "OK policies count=$($polData.policies.Count)"

Write-Host "== 10. Audit logs =="
$logs = Invoke-WebRequest -Uri "$consoleBase/audit-logs" -WebSession $memberSession -UseBasicParsing
$logData = $logs.Content | ConvertFrom-Json
Write-Host "OK audit logs count=$($logData.logs.Count)"

Write-Host "`n=== E2E PASSED ==="
Write-Host "Admin: $adminEmail / $adminPass"
Write-Host "Member: $memberEmail / $memberPass"
Write-Host "Console: http://localhost:3000/login"
