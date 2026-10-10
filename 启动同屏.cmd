@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title 同屏 TongPing

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 Node.js。请先安装 Node.js 20 LTS：https://nodejs.org/zh-cn
  echo        安装完成后，关掉这个窗口重新双击。
  pause
  exit /b 1
)

for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  echo [错误] Node.js 版本太旧（当前主版本 %NODE_MAJOR%），需要 20 或更新。
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 第一次运行，正在安装依赖（只需一次，约 1-3 分钟）...
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo [错误] 依赖安装失败。国内网络可先运行：npm config set registry https://registry.npmmirror.com
    pause
    exit /b 1
  )
)

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo 已根据 .env.example 生成 .env（默认使用本机 Chrome）。
)

echo.
echo 正在启动同屏……这个窗口要一直开着，关掉窗口 = 关掉同屏。
echo.
call npm run up
echo.
echo 同屏已停止。如果是意外退出，另开一个窗口运行 npm run doctor 并把结果发给 AI。
pause
