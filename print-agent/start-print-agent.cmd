@echo off
setlocal
cd /d "%~dp0\.."
title Restaurant Print Agent
echo.
echo Restaurant Print Agent
echo =======================
echo Keep this window open. Closing it will stop automatic printing.
echo.
pnpm print-agent
echo.
echo Print agent exited. Press any key to close this window.
pause >nul
