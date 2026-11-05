@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title 同屏 TongPing + 固定隧道（启动器 v109）

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 Node.js。请先安装 Node.js 20 LTS。
  echo https://nodejs.org/zh-cn
  pause
  exit /b 1
)

set "NGROK_BIN="
for /f "delims=" %%I in ('where ngrok 2^>nul') do if not defined NGROK_BIN set "NGROK_BIN=%%I"
if not defined NGROK_BIN if exist "%~dp0ngrok.exe" set "NGROK_BIN=%~dp0ngrok.exe"
if not defined NGROK_BIN if exist "%~dp0..\tongping\ngrok.exe" set "NGROK_BIN=%~dp0..\tongping\ngrok.exe"
if not defined NGROK_BIN if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ngrok.exe" set "NGROK_BIN=%LOCALAPPDATA%\Microsoft\WinGet\Links\ngrok.exe"

if not defined NGROK_BIN (
  echo [错误] 没有找到 ngrok.exe。
  echo 请把旧版 tongping 文件夹里的 ngrok.exe 复制到当前文件夹，然后重新双击。
  pause
  exit /b 1
)
set "TONGPING_NGROK_BIN=%NGROK_BIN%"

if not exist "node_modules\" (
  echo 第一次运行，正在安装依赖（只需一次，约 1-3 分钟）...
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo [错误] 依赖安装失败。
    pause
    exit /b 1
  )
)

if not exist "node_modules\hls.js\dist\hls.light.min.js" (
  echo 正在补充电脑端陪看播放器（只需一次）...
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo [错误] 电脑端陪看播放器安装失败。
    pause
    exit /b 1
  )
)

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo 已根据 .env.example 生成 .env。
)

echo.
echo [启动器 v109] 正在启动固定隧道和同屏……以后只需要双击这一个文件。
echo 这个窗口要一直开着；关闭窗口时，同屏和隧道会一起停止。
echo.
node scripts\start-ngrok.mjs
echo.
echo 同屏和隧道已停止。
pause
