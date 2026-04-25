@echo off
setlocal
set "SCRIPT=%~dp0storehub.ps1"
if not exist "%SCRIPT%" (
  echo Missing tools\storehub.ps1
  exit /b 1
)
powershell -ExecutionPolicy Bypass -File "%SCRIPT%" %*
