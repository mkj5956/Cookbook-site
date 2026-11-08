$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root
$env:PYTHONUTF8 = '1'
$Python = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { throw 'Run 1_INSTALL.bat first.' }
Write-Host 'Installing photo-to-3D support. Allow at least 8 GB additional free disk space.'
& $Python -m pip install -r (Join-Path $Root 'requirements-3d.txt') -c (Join-Path $Root 'constraints.txt')
if ($LASTEXITCODE -ne 0) { throw '3D dependencies could not be installed.' }
& $Python (Join-Path $Root 'prepare_3d.py')
if ($LASTEXITCODE -ne 0) { throw '3D model download or offline load check failed.' }
