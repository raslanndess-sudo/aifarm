#!/usr/bin/env pwsh
# autopush.ps1 - автоматический git commit + push после доработки проекта
# Вызывается агентом после изменений в проекте

param(
    [string]$Message = "update: project changes"
)

Set-Location "E:\Users\rasla\.openclaw\workspace"

$status = git status --porcelain 2>&1
if (-not $status) {
    Write-Host "Nothing to commit."
    exit 0
}

git add model-manager pipeline tools templates packages yt-comments 2>&1
git add .gitignore AGENTS.md HEARTBEAT.md IDENTITY.md SOUL.md TOOLS.md USER.md 2>&1

$staged = git diff --cached --name-only 2>&1
if (-not $staged) {
    Write-Host "Nothing staged to commit."
    exit 0
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "$Message [$timestamp]" 2>&1
git push origin main 2>&1

Write-Host "Done: pushed to github.com/raslanndess-sudo/aifarm"
