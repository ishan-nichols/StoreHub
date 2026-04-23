# deploy.ps1 — Pull latest code, rebuild, migrate, and restart services.
# Runs on Windows local development machine.
# Called by poll.ps1 automatically, or manually: .\scripts\deploy.ps1
param(
  [switch]$Force  # Skip the "changes detected" check and deploy unconditionally
)

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $PSScriptRoot
Set-Location $RepoDir

# Ensure node/pnpm/pm2 are on PATH
$env:PATH = "C:\Program Files\nodejs;C:\Users\$env:USERNAME\AppData\Roaming\npm;$env:PATH"

Write-Host "[deploy] Pulling latest code..." -ForegroundColor Cyan
git pull --ff-only

Write-Host "[deploy] Installing dependencies..." -ForegroundColor Cyan
pnpm install --frozen-lockfile

Write-Host "[deploy] Building API server..." -ForegroundColor Cyan
pnpm --filter "@workspace/api-server" run build

Write-Host "[deploy] Running database migrations..." -ForegroundColor Cyan
$env:DATABASE_URL = (Get-Content "$RepoDir\artifacts\api-server\.env" |
  Where-Object { $_ -match "^DATABASE_URL=" } |
  ForEach-Object { $_ -replace "^DATABASE_URL=", "" })
pnpm --filter "@workspace/db" run push

Write-Host "[deploy] Restarting API server via PM2..." -ForegroundColor Cyan
pm2 restart storehub-api --update-env

Write-Host "[deploy] Restarting web server via PM2..." -ForegroundColor Cyan
pm2 restart storehub-web --update-env

Write-Host "[deploy] Done!" -ForegroundColor Green
pm2 list
