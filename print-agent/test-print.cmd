@echo off
setlocal
cd /d "%~dp0\.."
title Wok Dragon Test Print
echo.
echo This will send one sample kitchen ticket to the configured printer.
echo If no printer name is configured, Windows default printer will be used.
echo.
choice /C YN /M "Run test print"
if errorlevel 2 goto end
pnpm print-agent -- --test-print
:end
echo.
pause
