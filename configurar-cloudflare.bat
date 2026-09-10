@echo off
cd /d "%~dp0"
title SIGeCom - Configurar Cloudflare
echo.
echo  Autoriza este PC en Cloudflare (una sola vez).
echo  Luego iniciar-red.bat publica la mesa con URL fija.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar-cloudflare.ps1"
if errorlevel 1 pause
