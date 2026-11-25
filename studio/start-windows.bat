@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js ontbreekt. Installeer Node.js 22 LTS via https://nodejs.org en start opnieuw. & start https://nodejs.org & pause & exit /b 1)
node scripts\start.mjs
pause
