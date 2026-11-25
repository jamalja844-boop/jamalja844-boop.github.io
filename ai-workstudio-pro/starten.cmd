@echo off
setlocal
cd /d "%~dp0"
title AI WorkStudio Pro
if not exist "apps\web\.env" (
  echo  AI WorkStudio Pro is nog niet geinstalleerd.
  echo  Dubbelklik eerst op installeren.cmd
  pause
  exit /b 1
)
echo  AI WorkStudio Pro starten...
echo  De browser opent zo vanzelf op http://localhost:3000
echo  Laat dit venster open zolang je de software gebruikt. Sluiten = stoppen.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 20; Start-Process 'http://localhost:3000'"
call npm run dev
pause
