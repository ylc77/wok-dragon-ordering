@echo off
setlocal
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Wok Dragon 自动打印助手.lnk"

echo.
echo 正在取消开机自启...
if exist "%SHORTCUT%" (
  del "%SHORTCUT%"
  echo 已取消开机自启。
) else (
  echo 未找到开机自启快捷方式。
)
echo.
pause
