param(
  [Parameter(Position=0)]
  [ValidateSet("start","stop","restart","status","logs","help")]
  [string]$Command = "help"
)

$ErrorActionPreference = "Stop"

function RepoRoot {
  Split-Path -Parent $PSScriptRoot
}

function Ensure-Dirs {
  $root = RepoRoot
  $runDir = Join-Path $root ".storehub\\run"
  $logDir = Join-Path $root ".storehub\\logs"
  New-Item -ItemType Directory -Force -Path $runDir | Out-Null
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  return @{ runDir = $runDir; logDir = $logDir }
}

function PidPath([string]$name) {
  $dirs = Ensure-Dirs
  Join-Path $dirs.runDir "$name.pid"
}

function LogPath([string]$name) {
  $dirs = Ensure-Dirs
  Join-Path $dirs.logDir "$name.log"
}

function Is-Running([string]$name) {
  $pidFile = PidPath $name
  if (!(Test-Path $pidFile)) { return $false }
  $procIdText = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (!$procIdText) { return $false }
  $procIdText = $procIdText.Trim()
  $procId = 0
  if (-not [int]::TryParse($procIdText, [ref]$procId)) { return $false }
  return [bool](Get-Process -Id $procId -ErrorAction SilentlyContinue)
}

function Start-Service([string]$name, [string]$workDir, [string]$cmd, [string[]]$args) {
  if (Is-Running $name) { return }
  $pidFile = PidPath $name
  $logFile = LogPath $name

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $cmdLine = ($cmd + " " + ($args -join " ")).Trim()
  if (!(Test-Path $logFile)) { New-Item -ItemType File -Force -Path $logFile | Out-Null }

  # Always run via cmd.exe so we can reliably redirect logs on Windows.
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c " + $cmdLine + " >> """ + $logFile + """ 2>&1"
  $psi.WorkingDirectory = $workDir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi

  $null = $proc.Start()
  Set-Content -Path $pidFile -Value $proc.Id
}

function Stop-Service([string]$name) {
  $pidFile = PidPath $name
  if (!(Test-Path $pidFile)) { return }
  $procIdText = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($procIdText) {
    $procIdText = $procIdText.Trim()
    $procId = 0
    if ([int]::TryParse($procIdText, [ref]$procId)) {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($p) { Stop-Process -Id $procId -Force }
    }
  }
  Remove-Item -Force -ErrorAction SilentlyContinue $pidFile
}

function Print-Status {
  $root = RepoRoot
  $fe = Is-Running "frontend"
  $be = Is-Running "api"
  Write-Host ""
  Write-Host "StoreHub Dev Server"
  Write-Host "Repo: $root"
  Write-Host ""
  Write-Host ("Frontend: " + ($(if ($fe) { "RUNNING  http://localhost:5173" } else { "stopped" })))
  Write-Host ("API:      " + ($(if ($be) { "RUNNING  http://localhost:8080" } else { "stopped" })))
  Write-Host ""
  if ($fe -or $be) {
    Write-Host "Logs:"
    Write-Host ("- Frontend: " + (LogPath "frontend"))
    Write-Host ("- API:      " + (LogPath "api"))
    Write-Host ""
  }
}

function Usage {
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File tools\\storehub.ps1 start"
  Write-Host "  powershell -ExecutionPolicy Bypass -File tools\\storehub.ps1 stop"
  Write-Host "  powershell -ExecutionPolicy Bypass -File tools\\storehub.ps1 status"
  Write-Host "  powershell -ExecutionPolicy Bypass -File tools\\storehub.ps1 logs"
  Write-Host ""
}

$root = RepoRoot
$frontendDir = Join-Path $root "artifacts\\storehub"
$apiDir = Join-Path $root "artifacts\\api-server"
$pmCmd = "corepack"
$pmPrefix = @("pnpm")

switch ($Command) {
  "start" {
    Ensure-Dirs | Out-Null
    Start-Service "api" $apiDir $pmCmd ($pmPrefix + @("run","dev")) | Out-Null
    Start-Service "frontend" $frontendDir $pmCmd ($pmPrefix + @("run","dev")) | Out-Null
    Print-Status
    Write-Host "Tip: run `tools\\storehub.ps1 logs` to tail logs."
  }
  "stop" {
    Stop-Service "frontend"
    Stop-Service "api"
    Print-Status
  }
  "restart" {
    Stop-Service "frontend"
    Stop-Service "api"
    Start-Sleep -Milliseconds 250
    Ensure-Dirs | Out-Null
    Start-Service "api" $apiDir $pmCmd ($pmPrefix + @("run","dev")) | Out-Null
    Start-Service "frontend" $frontendDir $pmCmd ($pmPrefix + @("run","dev")) | Out-Null
    Print-Status
  }
  "status" {
    Print-Status
  }
  "logs" {
    $feLog = LogPath "frontend"
    $beLog = LogPath "api"
    if (!(Test-Path $feLog) -and !(Test-Path $beLog)) {
      Print-Status
      Write-Host "No logs yet. Start the server first."
      exit 0
    }
    Write-Host ""
    Write-Host "Tailing logs (Ctrl+C to stop)..."
    Write-Host ("Frontend: " + $feLog)
    Write-Host ("API:      " + $beLog)
    Write-Host ""
    if (!(Test-Path $feLog)) { New-Item -ItemType File -Force -Path $feLog | Out-Null }
    if (!(Test-Path $beLog)) { New-Item -ItemType File -Force -Path $beLog | Out-Null }
    Get-Content -Path $feLog, $beLog -Tail 80 -Wait
  }
  default {
    Usage
  }
}
