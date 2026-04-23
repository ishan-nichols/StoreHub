# setup-local.ps1 — One-time setup for local Windows auto-deploy.
# Run this once as Administrator: .\scripts\setup-local.ps1
# After running: push to GitHub and the server updates automatically within ~1 minute.

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $PSScriptRoot
$env:PATH = "C:\Program Files\nodejs;C:\Users\$env:USERNAME\AppData\Roaming\npm;C:\Program Files\Git\cmd;$env:PATH"

Write-Host "`n=== StoreHub Local Auto-Deploy Setup ===" -ForegroundColor Cyan

# 1. Install PM2 globally if not present
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "[setup] Installing PM2..." -ForegroundColor Yellow
  npm install -g pm2
} else {
  Write-Host "[setup] PM2 already installed: $(pm2 --version)" -ForegroundColor Green
}

# 2. Build API server first time
Write-Host "[setup] Building API server..." -ForegroundColor Yellow
Set-Location "$RepoDir\artifacts\api-server"
pnpm run build

# 3. Start services with PM2 (dev mode: Vite dev server + built API)
Write-Host "[setup] Starting services with PM2..." -ForegroundColor Yellow
Set-Location $RepoDir
pm2 start ecosystem.config.cjs

# 4. Save PM2 process list so it survives restarts
pm2 save

# 5. Create Task Scheduler task to poll every minute
Write-Host "[setup] Registering Task Scheduler job (StoreHubAutoDeploy)..." -ForegroundColor Yellow
$TaskName = "StoreHubAutoDeploy"
$PollScript = "$RepoDir\scripts\poll.ps1"
$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NonInteractive -WindowStyle Hidden -File `"$PollScript`""
$Trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 1) -Once -At (Get-Date)
$Settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Description "Polls GitHub for new commits and auto-deploys StoreHub" | Out-Null

Write-Host "[setup] Task Scheduler job registered." -ForegroundColor Green

# 6. Create log directory
New-Item -ItemType Directory -Path "C:\storehub-deploy" -Force | Out-Null

Write-Host @"

=== Setup Complete! ===

Services managed by PM2:
  storehub-api  — http://localhost:8080
  storehub-web  — http://localhost:5173

Auto-deploy is active. Every minute, the poller checks GitHub.
When you push to main, the server will update within ~1 minute.

Useful commands:
  pm2 list                    — show running processes
  pm2 logs storehub-api       — tail API logs
  pm2 logs storehub-web       — tail frontend logs
  pm2 restart storehub-api    — manual restart
  Get-Content C:\storehub-deploy\poll.log -Tail 20   — view deploy log

To move to cloud: see .github/workflows/deploy.yml
"@ -ForegroundColor Cyan
