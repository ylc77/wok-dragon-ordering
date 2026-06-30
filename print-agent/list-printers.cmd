@echo off
setlocal
cd /d "%~dp0\.."
title Wok Dragon 打印机列表
echo.
echo 正在读取 Windows 打印机列表...
echo.
pnpm print-agent -- --list-printers
echo.
pause
