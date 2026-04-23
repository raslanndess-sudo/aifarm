@echo off
REM ==========================================================
REM Higgsfield auth bootstrap for Claude Code chrome-devtools MCP
REM ==========================================================
REM What it does:
REM   1. If Chrome is already running on port 9222 -> opens a new tab to Higgsfield.
REM   2. Otherwise launches Chrome with remote-debugging port + persistent
REM      user-data-dir where Higgsfield cookies/session live, and opens the tab.
REM
REM After this script runs, ANY Claude Code session can connect via the
REM chrome-devtools MCP (which talks to localhost:9222) and drive Higgsfield
REM as if you were already logged in. No manual login needed unless cookies
REM expired.
REM ==========================================================

setlocal
set "CHROME=E:\Program Files\Google\Chrome\Application\chrome.exe"
set "URL=https://higgsfield.ai/ai/image?model=nano-banana-2"
set "PROJECT=E:\Users\rasla\Desktop\ai-video-platform"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=manual"

if "%MODE%"=="playwright" (
    set "USERDATA=E:\Users\rasla\chrome-automation-safe"
    set "PORT=9223"
) else (
    set "USERDATA=E:\Users\rasla\chrome-automation"
    set "PORT=9222"
)

REM --- Verify chrome.exe exists ----------------------------------------------
if not exist "%CHROME%" (
    echo [ERROR] Chrome not found at "%CHROME%"
    echo Edit start.bat and update the CHROME path.
    pause
    exit /b 1
)

REM --- Is Chrome already serving the debugger on PORT? -----------------------
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'http://localhost:%PORT%/json/version' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
    echo [OK] Chrome already on port %PORT% — opening new Higgsfield tab...
    powershell -NoProfile -Command "try { Invoke-WebRequest -Method PUT -Uri 'http://localhost:%PORT%/json/new?%URL%' -UseBasicParsing | Out-Null; Write-Host 'Tab opened.' } catch { Write-Host ('Failed to open tab: ' + $_) }"
    goto :done
)

REM --- Launch Chrome ----------------------------------------------------------
echo [..] Launching Chrome with remote-debugging on port %PORT%...
echo      user-data-dir = %USERDATA%
REM Playwright profile must be reachable from WSL — bind on all interfaces.
REM Manual profile stays on Chrome default (127.0.0.1) for safety.
if "%MODE%"=="playwright" (
    start "" "%CHROME%" --remote-debugging-port=%PORT% --remote-debugging-address=0.0.0.0 --user-data-dir="%USERDATA%" "%URL%"
) else (
    start "" "%CHROME%" --remote-debugging-port=%PORT% --user-data-dir="%USERDATA%" "%URL%"
)

REM --- Wait until the debugger answers (max ~15s) ----------------------------
echo [..] Waiting for Chrome DevTools endpoint...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(15); while((Get-Date) -lt $deadline){ try { $null = Invoke-WebRequest -Uri 'http://localhost:%PORT%/json/version' -UseBasicParsing -TimeoutSec 2; Write-Host '[OK] DevTools ready.'; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; Write-Host '[WARN] DevTools did not respond in 15s — Chrome may still be loading.'"

:done
echo.
echo [..] Launching PowerShell with Claude Code in %PROJECT%...
start "Claude Code" powershell -NoExit -NoLogo -Command "Set-Location '%PROJECT%'; claude"

echo.
echo ==========================================================
echo  If this is the first run with this user-data-dir,
echo  log in to Higgsfield manually. Cookies persist after that —
echo  next launches will be already-logged-in.
echo.
echo  Claude Code is starting in a new PowerShell window.
echo  It can drive the browser via chrome-devtools MCP
echo  (already configured to localhost:%PORT%).
echo ==========================================================
endlocal
