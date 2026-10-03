# FOXREX experience - LOCAL REX ASSET INGEST (Windows, development only).
#
#   powershell -ExecutionPolicy Bypass -File experience\ingest-rex.ps1            ingest + open the review page
#   powershell -ExecutionPolicy Bypass -File experience\ingest-rex.ps1 -NoOpen    ingest only
#   powershell -ExecutionPolicy Bypass -File experience\ingest-rex.ps1 -DryRun    report only, write nothing
#
# Reads files you placed in experience\assets\rex\inbox\, validates them, writes web-ready candidates to
# experience\assets\rex\processed\, and (after you APPROVE in the review page and run this again) copies the
# approved variant to experience\assets\rex\approved\ and rewrites experience\assets\rex\rex-assets.json.
# It never uploads, publishes or commits anything; inbox/processed/approved are gitignored.
param([switch]$NoOpen, [switch]$DryRun, [switch]$NoMedia, [int]$Port = 5180)
$env:PYTHONIOENCODING = 'utf-8'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$Xp = $PSScriptRoot
$Root = Split-Path -Parent $Xp
Set-Location $Root

$py = Get-Command py -ErrorAction SilentlyContinue; $pyPre = @('-3')
if (-not $py) { $py = Get-Command python -ErrorAction SilentlyContinue; $pyPre = @() }
if (-not $py) { Write-Error 'Python 3 is required (winget install Python.Python.3.12), then open a new PowerShell window.'; exit 1 }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -and -not $env:FFMPEG) {
  Write-Warning 'ffmpeg not found: stills are fully handled; videos cannot be verified or encoded. Install with: winget install Gyan.FFmpeg (then open a new window).'
}
$inbox = Join-Path $Xp 'assets\rex\inbox'
New-Item -ItemType Directory -Force -Path $inbox | Out-Null
Write-Host "Branch: $(git rev-parse --abbrev-ref HEAD 2>$null)   Inbox: $inbox"

$ingestArgs = @()
if ($DryRun) { $ingestArgs += '--dry-run' }
if ($NoMedia) { $ingestArgs += '--no-media' }
& $py.Source @pyPre (Join-Path $Xp 'tools\rex_ingest.py') @ingestArgs
if ($LASTEXITCODE -ne 0) { Write-Error "ingest failed (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
if ($NoOpen -or $DryRun) { exit 0 }

$Url = "http://localhost:$Port/experience/rex-review/"
$ping = $null
try { $ping = Invoke-RestMethod "http://localhost:$Port/__rex/ping" -TimeoutSec 2 } catch { }
if (-not $ping) {
  $busy = $false
  try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/experience/" -TimeoutSec 2 | Out-Null; $busy = $true } catch { }
  if ($busy) {
    Write-Warning "Port $Port is served by another (read-only) server. Stop it (close its window or Stop-Process) and run this again so APPROVE/REJECT can be saved."
  } else {
    $p = Start-Process -FilePath $py.Source -ArgumentList ($pyPre + @((Join-Path $Xp 'tools\rex_review_server.py'), '--port', "$Port")) -WorkingDirectory $Root -WindowStyle Minimized -PassThru
    Write-Host "Review server started (pid $($p.Id)) - leave it running; stop later with: Stop-Process -Id $($p.Id)"
    Start-Sleep -Seconds 2
  }
}
try { Start-Process chrome $Url } catch { Start-Process $Url }
Write-Host "Review: $Url"
Write-Host 'After APPROVE/REJECT, run this script again to apply the decision (approved/ + rex-assets.json).'
