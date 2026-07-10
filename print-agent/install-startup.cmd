@echo off
setlocal
cd /d "%~dp0\.."
title Restaurant Print Agent - Install Startup
echo.
echo Installing Windows startup shortcut...
echo.
pnpm print-agent -- --install-startup
echo.
pause
