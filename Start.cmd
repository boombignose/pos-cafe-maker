@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 24 LTS from https://nodejs.org/ first.
 pause
 exit /b 1
)
if not exist node_modules\pg (
 call npm ci --omit=dev
 if errorlevel 1 (
  echo Dependency installation failed. Check Internet access and INSTALL.md.
  pause
  exit /b 1
 )
)
node scripts\shop\cli.mjs start
pause
