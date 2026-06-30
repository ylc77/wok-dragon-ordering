@echo off
setlocal
cd /d "%~dp0\.."
title Wok Dragon Install Startup
echo.
echo Installing Windows startup shortcut...
echo.
pnpm print-agent -- --install-startup
echo.
pause
