@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title 同屏 TongPing + 固定隧道

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 Node.js。请先安装 Node.js 20 LTS：https://nodejs.org/zh-cn
  pause
  exit /b 1
)

where ngrok >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 ngrok。
  echo        安装后先运行一次：ngrok config add-authtoken 你的令牌
  pause
  exit /b 1
)

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
echo 正在启动固定隧道和同屏……以后只需要双击这一个文件。
echo 这个窗口要一直开着；按 Ctrl+C 或关掉窗口会一起停止。
echo.
node scripts\start-ngrok.mjs
echo.
echo 同屏和隧道已停止。
pause
