$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$env:PYTHONUTF8 = '1'
$env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
function Run-Python {
    param([string[]]$Arguments)
    & $script:Python @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Python step failed (code $LASTEXITCODE). See the message above." }
}
Write-Host 'LOOKBOOK / Windows AI setup' -ForegroundColor Green
Write-Host 'Requires NVIDIA RTX 30 series or newer, 8 GB VRAM minimum; 12 GB recommended.'
Write-Host 'This downloads Python packages and AI model weights. Allow at least 15 GB free disk space.'
Write-Host 'Your photos are not used or uploaded during installation.'
$Smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if (-not $Smi) {
    $Candidate = Join-Path $env:WINDIR 'System32\nvidia-smi.exe'
    if (Test-Path -LiteralPath $Candidate) { $Smi = $Candidate }
}
if (-not $Smi) { throw 'NVIDIA driver was not found. Run 0_CHECK_PC.bat and update the NVIDIA driver first.' }
& $Smi --query-gpu=name,memory.total --format=csv,noheader
if ($LASTEXITCODE -ne 0) { throw 'Unable to query your NVIDIA GPU. Update its driver first.' }
$Python = $null
$ProbePreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$Launcher = Get-Command py -ErrorAction SilentlyContinue
if ($Launcher) {
    foreach ($Version in @('-3.12', '-3.11')) {
        $Found = & $Launcher $Version -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $Found) { $Python = $Found.Trim(); break }
    }
}
if (-not $Python) {
    $Existing = Get-Command python -ErrorAction SilentlyContinue
    if ($Existing) {
        $Found = & $Existing -c 'import sys; assert (3,11) <= sys.version_info[:2] <= (3,12); print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $Found) { $Python = $Found.Trim() }
    }
}
$ErrorActionPreference = $ProbePreference
if (-not $Python) {
    Write-Host 'Python 3.12 is required. Installing the official Python package via Windows Package Manager.' -ForegroundColor Yellow
    $Winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $Winget) { throw 'Install Python 3.12 (64-bit) from python.org, then run 1_INSTALL.bat again.' }
    & $Winget install --id Python.Python.3.12 --exact --source winget --scope user --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw 'Python installation did not complete. Install Python 3.12 (64-bit), then try again.' }
    $Python = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if (-not (Test-Path -LiteralPath $Python)) { throw 'Python was installed. Close this window and run 1_INSTALL.bat again.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $Root '.venv\Scripts\python.exe'))) {
    Run-Python -Arguments @('-m', 'venv', (Join-Path $Root '.venv'))
}
$Python = Join-Path $Root '.venv\Scripts\python.exe'
Run-Python -Arguments @('-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel')
Run-Python -Arguments @('-m', 'pip', 'install', 'torch==2.8.0', 'torchvision==0.23.0', '--index-url', 'https://download.pytorch.org/whl/cu128')
Run-Python -Arguments @('-m', 'pip', 'install', '-r', (Join-Path $Root 'requirements.txt'), '-c', (Join-Path $Root 'constraints.txt'))
Run-Python -Arguments @((Join-Path $Root 'prepare_models.py'))
Write-Host 'Setup complete. Double-click 2_START.bat to open your lookbook.' -ForegroundColor Green
