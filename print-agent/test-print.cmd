@echo off
setlocal
cd /d "%~dp0\.."
title Wok Dragon 测试打印
echo.
echo 将发送一张测试厨房小票到配置的打印机。
echo 如果 PRINTER_NAME 为空，将使用 Windows 默认打印机。
echo.
choice /C YN /M "确认测试打印吗"
if errorlevel 2 goto end
pnpm print-agent -- --test-print
:end
echo.
pause
