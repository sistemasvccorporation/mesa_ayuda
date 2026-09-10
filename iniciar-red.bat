@echo off
cd /d "%~dp0"
title SIGeCom - Cloudflare
echo.
echo  SIGeCom Mesa de Ayuda
echo  Este PC + Cloudflare Tunnel.
echo  Al final te sale una URL https://....trycloudflare.com
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-red.ps1"
if errorlevel 1 pause
