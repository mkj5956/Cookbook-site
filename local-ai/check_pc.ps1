[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Write-Host 'LOOKBOOK / PC requirements check' -ForegroundColor Green
Write-Host ('Windows: ' + (Get-CimInstance Win32_OperatingSystem).Caption)
Write-Host ('System RAM: ' + [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1) + ' GB')
Get-CimInstance Win32_VideoController | Select-Object Name | Format-Table -AutoSize
$Smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($Smi) { & $Smi --query-gpu=name,memory.total,driver_version --format=csv }
else { Write-Host 'NVIDIA driver not found. This package requires a compatible NVIDIA GPU.' -ForegroundColor Yellow }
Write-Host 'Target: NVIDIA RTX 30 series or newer; 8 GB VRAM minimum; 12 GB recommended.'
Write-Host 'System RAM: 16 GB or more recommended. Disk: 15 GB or more free.'
Write-Host '8 GB GPUs may still run out of memory. A successful real try-on is the final check.'
