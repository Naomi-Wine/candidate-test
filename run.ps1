# Starts the API and the Angular dev server. See README.md for the manual commands.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

foreach ($tool in 'dotnet', 'node') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "$tool is not on PATH. Install it and try again." -ForegroundColor Red
        exit 1
    }
}

foreach ($port in 60702, 4200) {
    $held = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($held) {
        Write-Host "Port $port is already in use by PID $($held[0].OwningProcess). Stop it and try again." -ForegroundColor Red
        exit 1
    }
}

# A fresh clone has no node_modules; the reviewer should not have to know that.
if (-not (Test-Path "$root\client\node_modules")) {
    Write-Host 'Installing client dependencies (first run only, a few minutes)...'
    npm install --prefix "$root\client"
}

Write-Host 'Starting the API and the Angular dev server...'
Start-Process dotnet -ArgumentList 'run', '--project', "$root\src\Requests.Api"
Start-Process npm.cmd -ArgumentList 'start', '--prefix', "$root\client"

foreach ($url in 'http://localhost:60702/api/requests', 'http://localhost:4200/') {
    $ready = $false
    foreach ($attempt in 1..60) {
        try {
            Invoke-WebRequest $url -Headers @{ 'X-User-Id' = '1' } -UseBasicParsing -TimeoutSec 5 | Out-Null
            $ready = $true
            break
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $ready) {
        Write-Host "$url did not come up. Check the two windows that just opened." -ForegroundColor Red
        exit 1
    }
}

Write-Host ''
Write-Host 'Open http://localhost:4200' -ForegroundColor Green
Write-Host 'To stop both: .\stop.cmd'
