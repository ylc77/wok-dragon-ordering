@echo off
setlocal
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Restaurant Print Agent.lnk"

echo.
echo Removing Windows startup shortcut...
if exist "%SHORTCUT%" (
  del "%SHORTCUT%"
  echo Startup shortcut removed:
  echo %SHORTCUT%
) else (
  echo Startup shortcut was not found.
)
echo.
pause
