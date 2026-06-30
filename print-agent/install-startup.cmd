@echo off
setlocal
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP_DIR%\Wok Dragon 自动打印助手.lnk"
set "TARGET=%~dp0start-print-agent.cmd"

echo.
echo 正在安装开机自启...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0..'; $s.WindowStyle=7; $s.Description='Wok Dragon 自动打印助手'; $s.Save()"

if exist "%SHORTCUT%" (
  echo 已安装开机自启：
  echo %SHORTCUT%
) else (
  echo 安装失败，请检查权限。
)
echo.
pause
