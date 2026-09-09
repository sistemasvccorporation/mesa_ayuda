@echo off
cd /d "%~dp0"
title SIGeCom - Detener servidor
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0detener-local.ps1"
pause
