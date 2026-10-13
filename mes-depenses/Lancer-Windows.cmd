@echo off
cd /d "%~dp0"
py -3 server.py
if errorlevel 1 (
  echo.
  echo Le lanceur utilise Python 3. Installe Python depuis python.org si la commande py est introuvable.
  pause
)
