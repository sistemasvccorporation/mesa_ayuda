@echo off
cd /d "%~dp0"
title SIGeCom - Cloudflare
echo.
echo  SIGeCom Mesa de Ayuda
echo  Un clic: este PC + Cloudflare Tunnel.
echo  Al final te sale una URL https para compartir.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-red.ps1"
if errorlevel 1 pause
