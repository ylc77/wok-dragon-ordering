@echo off
setlocal
cd /d "%~dp0\.."
title Wok Dragon Printers
echo.
echo Reading Windows printer list...
echo.
pnpm print-agent -- --list-printers
echo.
pause
