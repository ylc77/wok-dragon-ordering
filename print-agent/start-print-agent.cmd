@echo off
setlocal
cd /d "%~dp0\.."
title Wok Dragon 自动打印助手
echo.
echo Wok Dragon 自动打印助手
echo ======================================
echo 请保持此窗口打开。关闭窗口后将停止自动打印。
echo.
pnpm print-agent
echo.
echo 打印助手已退出。按任意键关闭窗口。
pause >nul
