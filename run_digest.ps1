param([int]$Limit = 12, [switch]$Send)

$ErrorActionPreference = "Stop"
Set-Location "E:\Users\rasla\.openclaw\workspace"

$logDir = "E:\Users\rasla\.openclaw\workspace\logs\digest"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "$logDir\digest_$timestamp.log"

$env:PYTHONIOENCODING = "utf-8"
$args_list = @("digest_builder.py", "--limit", $Limit.ToString())
if ($Send) { $args_list += "--send" }

python @args_list > $logFile 2>&1
$code = $LASTEXITCODE
Remove-Item Env:PYTHONIOENCODING -ErrorAction SilentlyContinue

if ($code -ne 0) {
    $msg = "Digest FAILED (exit $code). Log: $logFile"
    & "E:\Users\rasla\AppData\Roaming\npm\openclaw.cmd" message send --channel telegram --target 758984018 --message $msg
    exit 1
}
Write-Host "Digest OK: $logFile"
