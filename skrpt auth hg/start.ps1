# =============================================================
# Higgsfield auth bootstrap for Claude Code chrome-devtools MCP
# =============================================================
# Same behavior as start.bat, but native PowerShell.
# Run from any shell:  powershell -ExecutionPolicy Bypass -File "start.ps1"

param(
    [ValidateSet('manual','playwright')]
    [string]$Mode = 'manual'
)

$ErrorActionPreference = 'Continue'

$Chrome = 'E:\Program Files\Google\Chrome\Application\chrome.exe'
$Url    = 'https://higgsfield.ai/ai/image?model=nano-banana-2'

if ($Mode -eq 'playwright') {
    $UserData = 'E:\Users\rasla\chrome-automation-safe'
    $Port = 9223
} else {
    $UserData = 'E:\Users\rasla\chrome-automation'
    $Port = 9222
}

if (-not (Test-Path $Chrome)) {
    Write-Host "[ERROR] Chrome not found at $Chrome" -ForegroundColor Red
    Write-Host "Edit start.ps1 and update `$Chrome path."
    exit 1
}

# 1. Already running?
try {
    $null = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 2
    Write-Host "[OK] Chrome already on port $Port - opening new Higgsfield tab..."
    try {
        Invoke-WebRequest -Method PUT -Uri "http://localhost:$Port/json/new?$Url" -UseBasicParsing | Out-Null
        Write-Host "Tab opened."
    } catch {
        Write-Host "Failed to open tab: $_"
    }
    exit 0
} catch {
    # not running - proceed to launch
}

# 2. Launch
Write-Host "[..] Launching Chrome with remote-debugging on port $Port..."
Write-Host "     user-data-dir = $UserData"
$ChromeArgs = @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$UserData"
)
# Playwright profile must be reachable from WSL — bind on all interfaces.
# Manual profile stays on 127.0.0.1 (Chrome default) for safety.
if ($Mode -eq 'playwright') {
    $ChromeArgs += "--remote-debugging-address=0.0.0.0"
}
$ChromeArgs += $Url
Start-Process -FilePath $Chrome -ArgumentList $ChromeArgs

# 3. Wait for DevTools endpoint
Write-Host "[..] Waiting for Chrome DevTools endpoint..."
$deadline = (Get-Date).AddSeconds(15)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 2
        $ready = $true
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if ($ready) {
    Write-Host "[OK] DevTools ready."
} else {
    Write-Host "[WARN] DevTools did not respond in 15s - Chrome may still be loading."
}

Write-Host ""
Write-Host "=========================================================="
Write-Host " If this is the first run with this user-data-dir,"
Write-Host " log in to Higgsfield manually. Cookies persist after that -"
Write-Host " next launches will be already-logged-in."
Write-Host ""
Write-Host " Claude Code can now drive the browser via chrome-devtools MCP"
Write-Host " (already configured to localhost:$Port)."
Write-Host "=========================================================="
