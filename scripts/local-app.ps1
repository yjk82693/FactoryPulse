param(
    [ValidateSet('setup', 'start', 'stop')][string]$Action = 'start',
    [string]$Port
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$runtime = Join-Path $root '.local-runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$python = Join-Path $env:LOCALAPPDATA 'Programs/Python/Python311/python.exe'
if (!(Test-Path -LiteralPath $python)) {
    $python = & py -3 -c 'import sys; print(sys.executable)'
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.11+ first.' }
}

function Read-ProcessRecord($name) {
    $file = Join-Path $runtime "$name.json"
    if (!(Test-Path $file)) { return $null }
    $record = Get-Content $file -Raw | ConvertFrom-Json
    $process = Get-Process -Id $record.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $record.started) {
        return $process
    }
    return $null
}

function Launch($name, $executable, $arguments, $directory) {
    if (Read-ProcessRecord $name) { Write-Host "$name already running."; return }
    $process = Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden -RedirectStandardOutput "$runtime/$name.log" -RedirectStandardError "$runtime/$name.error.log" -PassThru
    @{ id = $process.Id; started = $process.StartTime.ToUniversalTime().Ticks.ToString() } | ConvertTo-Json | Set-Content "$runtime/$name.json"
    Start-Sleep -Seconds 1
    if ($process.HasExited) { throw "$name exited. See $runtime/$name.error.log" }
    Write-Host "$name started (PID $($process.Id))."
}

if ($Action -eq 'stop') {
    foreach ($name in @('sensor', 'frontend', 'backend')) {
        $process = Read-ProcessRecord $name
        if ($process) { Stop-Process -Id $process.Id; Write-Host "$name stopped." }
    }
    exit
}

if ($Action -eq 'setup') {
    & $python -m pip install --user -r backend/requirements.txt -r sensing/processing/python/requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
    Push-Location frontend
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    } finally { Pop-Location }
    Write-Host 'Setup complete. Run start-local.cmd.'
    exit
}

& $python -c 'import fastapi, uvicorn, httpx, jwt, psycopg, numpy, serial'
if ($LASTEXITCODE -ne 0) { throw 'Run setup-local.cmd first.' }
if (!(Test-Path 'frontend/node_modules/vite/bin/vite.js')) { throw 'Run setup-local.cmd first.' }
if (!(Test-Path 'backend/.env')) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path 'frontend/.env') -and !(Test-Path 'frontend/.env.local')) {
    (Get-Content frontend/.env.example) -replace '^VITE_DEMO_MODE=true$', 'VITE_DEMO_MODE=false' | Set-Content frontend/.env.local
}
foreach ($service in @(@('backend', 8000), @('frontend', 5173))) {
    if (!(Read-ProcessRecord $service[0]) -and (Get-NetTCPConnection -LocalPort $service[1] -State Listen -ErrorAction SilentlyContinue)) {
        throw "Port $($service[1]) is already in use by another process. Stop that server first."
    }
}
Launch 'backend' $python @('-m', 'uvicorn', 'backend.main:app', '--app-dir', "`"$root`"", '--host', '127.0.0.1', '--port', '8000', '--workers', '1') $root
Launch 'frontend' (Get-Command node.exe).Source @("`"$root/frontend/node_modules/vite/bin/vite.js`"", '--host', '127.0.0.1', '--port', '5173', '--strictPort') "$root/frontend"
if ($Port) {
    Launch 'sensor' $python @('-u', "`"$root/scripts/run-sensor.py`"", '--port', $Port) $root
}
foreach ($url in @('http://127.0.0.1:8000/health', 'http://127.0.0.1:5173')) {
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; $ready = $true; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (!$ready) { throw "Not ready: $url. Check logs in $runtime" }
}
Write-Host 'Ready: http://127.0.0.1:5173/dashboard'
Write-Host 'Services run independently of this terminal and VS Code. Use stop-local.cmd to stop.'
