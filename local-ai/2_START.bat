@echo off
cd /d "%~dp0"
set PYTHONUTF8=1
if not exist ".venv\Scripts\python.exe" (
  echo Run 1_INSTALL.bat first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" server.py
pause
