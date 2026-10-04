<#
  FOXREX worker — Windows Task Scheduler installer (operator PC).
  Registers a task that starts the worker at logon and restarts it on failure.
  Usage (PowerShell, as the operator):
    powershell -ExecutionPolicy Bypass -File deploy\windows\install-foxrex-worker.ps1 -WorkerDir C:\FOXREX\worker
    powershell -ExecutionPolicy Bypass -File deploy\windows\install-foxrex-worker.ps1 -Uninstall
  Notes:
  - Runs as the current user (git credentials / SSH key of that user are used for publishing).
  - Configuration stays in <WorkerDir>\.env — this script never reads or prints secrets.
  - A PC that sleeps or is switched off is NOT an always-on control plane: keep SCHEDULER_ENABLED=false there.
#>
param(
  [string]$WorkerDir = (Join-Path $PSScriptRoot '..\..\worker'),
  [string]$TaskName = 'FOXREX Worker',
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

if ($Uninstall) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task '$TaskName'."
  exit 0
}

$WorkerDir = (Resolve-Path $WorkerDir).Path
$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path (Join-Path $WorkerDir 'src\server.js'))) { throw "Not a FOXREX worker directory: $WorkerDir" }
if (-not (Test-Path (Join-Path $WorkerDir '.env'))) { Write-Warning "No .env in $WorkerDir — run 'npm run setup' first." }

$action   = New-ScheduledTaskAction -Execute $node -Argument 'src\server.js' -WorkingDirectory $WorkerDir
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'FOXREX Studio worker (CMS, publishing engine). Local only: 127.0.0.1:8787.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
try {
  $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 5
  Write-Host "Worker running: ok=$($h.ok) version=$($h.version) auth=$($h.authenticationRequired)"
} catch { Write-Warning "Task registered, but /health did not answer yet: $($_.Exception.Message)" }
