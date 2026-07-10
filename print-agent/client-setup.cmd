@echo off
setlocal
cd /d "%~dp0\.."
title Restaurant Print Agent - Client Setup

echo.
echo Restaurant Print Agent - Client Setup
echo =====================================
echo.
echo This wizard will help configure the local print agent.
echo Before continuing, make sure the printer driver is installed
echo and the Windows test page can print successfully.
echo.
pause

echo.
echo Step 1/5 - Windows printer list
echo --------------------------------
pnpm print-agent -- --list-printers
echo.
pause

echo.
echo Step 2/5 - Configure Supabase, admin account and printer
echo --------------------------------------------------------
pnpm print-agent -- --setup
if errorlevel 1 (
  echo.
  echo Setup failed. Please check the input and try again.
  echo.
  pause
  exit /b 1
)

echo.
choice /C YN /M "Step 3/5 - Run a test print now"
if errorlevel 2 goto skip_test_print
pnpm print-agent -- --test-print
if errorlevel 1 (
  echo.
  echo Test print failed. Please check printer driver, paper and printer name.
  echo.
  pause
)
:skip_test_print

echo.
choice /C YN /M "Step 4/5 - Install Windows startup shortcut"
if errorlevel 2 goto skip_startup
pnpm print-agent -- --install-startup
:skip_startup

echo.
choice /C YN /M "Step 5/5 - Start the print agent now"
if errorlevel 2 goto done
echo.
echo Keep this window open. Closing it will stop automatic printing.
echo.
pnpm print-agent

:done
echo.
echo Client setup finished.
echo.
pause
