@echo off
REM Start local Demo Bank stack helpers (API assumed already up).
setlocal
cd /d "%~dp0..\.."
if exist ".demo-tenant-local-stack.local.json" (
  for /f "usebackq delims=" %%i in (`node -e "const t=require('./.demo-tenant-local-stack.local.json');process.stdout.write(t.ingest_key||'')"`) do set DEMO_BANK_INGEST_KEY=%%i
  for /f "usebackq delims=" %%i in (`node -e "const t=require('./.demo-tenant-local-stack.local.json');process.stdout.write(t.organization_id||'')"`) do set AEGIS_ORGANIZATION_ID=%%i
  for /f "usebackq delims=" %%i in (`node -e "const t=require('./.demo-tenant-local-stack.local.json');process.stdout.write(t.api_base||'http://127.0.0.1:8088')"`) do set AEGIS_API_BASE=%%i
  set AEGIS_INGEST_KEY=%DEMO_BANK_INGEST_KEY%
  set AEGIS_CONSOLE_ORIGIN=http://127.0.0.1:3000
)
echo Starting bank simulator on :4000 ...
node docs\provenance\_raw\_restart_bank.mjs
endlocal
