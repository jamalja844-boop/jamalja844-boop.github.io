@echo off
setlocal
cd /d "%~dp0"
title AI WorkStudio Pro - installatie
echo.
echo  ================================================
echo     AI WorkStudio Pro - installatie
echo  ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is niet gevonden.
  echo  Installeer Node.js LTS via https://nodejs.org en dubbelklik daarna opnieuw op dit bestand.
  goto fout
)

echo  [1/3] Onderdelen installeren. Dit duurt een paar minuten...
call npm install --no-fund --no-audit
if errorlevel 1 goto fout

echo.
echo  [2/3] Database en instellingen klaarzetten...
call npm run setup
if errorlevel 1 goto fout

echo.
echo  [3/3] AI WorkStudio Pro starten...
echo  De browser opent zo vanzelf op http://localhost:3000
echo  Laat dit venster open zolang je de software gebruikt. Sluiten = stoppen.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 25; Start-Process 'http://localhost:3000'"
call npm run dev
goto einde

:fout
echo.
echo  ------------------------------------------------
echo  Er ging iets mis. Maak een schermafbeelding van
echo  dit venster en stuur die door.
echo  ------------------------------------------------
pause
exit /b 1

:einde
pause
