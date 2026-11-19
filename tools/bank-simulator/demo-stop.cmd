@echo off
REM Stop bank simulator listening on port 4000.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000" ^| findstr "LISTENING"') do (
  echo Stopping PID %%p on :4000
  taskkill /F /PID %%p >nul 2>&1
)
echo Done.
