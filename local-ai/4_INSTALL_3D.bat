@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_3d.ps1"
if errorlevel 1 echo 3D setup did not finish. Read the error above.
pause
