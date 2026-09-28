@echo off
rem Start the code-package sandbox check on Windows (tools\verify-code-sandbox.mjs says what it
rem checks). Double-click it, or run it from a Command Prompt:  tools\verify-code-sandbox.cmd
rem LF line endings, like every file here (.gitattributes): cmd.exe runs them; it has no goto or labels,
rem the one construct LF breaks.
rem It needs Node.js 22.12 or newer and this repository's dependencies; it offers to install those.
setlocal EnableDelayedExpansion
rem The report goes where the tester started.
set "VERIFY_REPORT_DIR=%CD%"
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 LTS or newer from https://nodejs.org, then run this again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split(\".\").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
if errorlevel 1 (
  echo Your Node.js is too old. Install Node.js 22.12 or newer from https://nodejs.org, then run this again.
  pause
  exit /b 1
)
if not exist "node_modules\puppeteer" (
  echo This repository's dependencies are not installed yet ^(about 2 minutes, downloads a browser^).
  set /p answer="Install them now with npm ci? [y/n] "
  if /i not "!answer!"=="y" (
    echo Run "npm ci" in %cd%, then run this again.
    pause
    exit /b 1
  )
  call npm ci
  if errorlevel 1 (
    echo npm ci failed; see the messages above.
    pause
    exit /b 1
  )
)
node tools\verify-code-sandbox.mjs %*
set "rc=!ERRORLEVEL!"
rem Keep the window open for a tester who double-clicked; a CI run pipes nul in, so it returns at once.
pause
exit /b !rc!
