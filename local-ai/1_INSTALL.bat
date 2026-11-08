@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 echo Setup did not finish. Read the error above before running 2_START.bat.
pause
