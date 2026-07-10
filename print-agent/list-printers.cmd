@echo off
setlocal
cd /d "%~dp0\.."
title Restaurant Print Agent - Printers
echo.
echo Reading Windows printer list...
echo.
pnpm print-agent -- --list-printers
echo.
pause
