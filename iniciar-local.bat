@echo off
cd /d "%~dp0"
title SIGeCom - Arranque local
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-local.ps1"
if errorlevel 1 pause
