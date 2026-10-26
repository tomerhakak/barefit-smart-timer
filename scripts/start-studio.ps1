$ErrorActionPreference = 'Stop'
$barefitRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $barefitRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Install Node.js 22 LTS before starting BareFit.'
}
if (-not (Test-Path -LiteralPath 'node_modules')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
if (-not (Test-Path -LiteralPath 'dist/index.html')) {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
}
npm start
