# poll.ps1 — Check for new commits on main; deploy if behind.
# Runs every minute via Windows Task Scheduler (set up by setup-local.ps1).
# Logs to: C:\storehub-deploy\poll.log

$LogFile = "C:\storehub-deploy\poll.log"
$RepoDir = "C:\Users\$env:USERNAME\storehub-project"

# Ensure log directory exists
if (-not (Test-Path "C:\storehub-deploy")) {
  New-Item -ItemType Directory -Path "C:\storehub-deploy" | Out-Null
}

function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

$env:PATH = "C:\Program Files\nodejs;C:\Users\$env:USERNAME\AppData\Roaming\npm;C:\Program Files\Git\cmd;$env:PATH"
Set-Location $RepoDir

try {
  # Fetch remote without merging
  git fetch origin main --quiet

  $local  = git rev-parse HEAD
  $remote = git rev-parse origin/main

  if ($local -eq $remote) {
    Log "[poll] Up to date ($($local.Substring(0,7))). Nothing to do."
  } else {
    Log "[poll] New commits detected (local=$($local.Substring(0,7)) remote=$($remote.Substring(0,7))). Deploying..."
    & "$RepoDir\scripts\deploy.ps1" 2>&1 | ForEach-Object { Log $_ }
    Log "[poll] Deploy complete."
  }
} catch {
  Log "[poll] ERROR: $_"
}
