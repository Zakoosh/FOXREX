# FOXREX experience - local owner review (development only), Windows.
# Serves THIS checkout on http://localhost:5180 and opens /experience/?review=1 in Chrome (or your default browser).
# It never modifies git state, production files or other checkouts.
$Port = if ($env:PORT) { $env:PORT } else { 5180 }
$Root = Split-Path -Parent $PSScriptRoot
$Url = "http://localhost:$Port/experience/?review=1"
Set-Location $Root
Write-Host "Branch: $(git rev-parse --abbrev-ref HEAD)   HEAD: $(git rev-parse HEAD)"
try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/experience/" -TimeoutSec 2 | Out-Null; Write-Host "Port $Port already serving - reusing it." }
catch {
  $py = Get-Command py -ErrorAction SilentlyContinue
  $srv = Join-Path $PSScriptRoot 'tools\rex_review_server.py'
  $pyArgs = @('-3', $srv, '--port', "$Port")
  if (-not $py) { $py = Get-Command python -ErrorAction SilentlyContinue; $pyArgs = @($srv, '--port', "$Port") }
  if (-not $py) { Write-Error 'Python 3 is required to serve the preview (winget install Python.Python.3.12).'; exit 1 }
  $p = Start-Process -FilePath $py.Source -ArgumentList $pyArgs -WorkingDirectory $Root -WindowStyle Minimized -PassThru
  Write-Host "Server started (pid $($p.Id)) - leave it running; stop later with: Stop-Process -Id $($p.Id)"
  Start-Sleep -Seconds 2
}
try { Start-Process chrome $Url } catch { Start-Process $Url }
Write-Host "Opened: $Url"
Write-Host "Normal (no review panel): http://localhost:$Port/experience/"
Write-Host "REX asset review (in context): http://localhost:$Port/experience/rex-review/"
