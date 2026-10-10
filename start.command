#!/bin/bash
# 同屏 TongPing（macOS 双击启动 / Linux 终端运行 ./start.command）
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 没有找到 Node.js。请先安装 Node.js 20 LTS：https://nodejs.org/zh-cn"
  read -r -p "按回车关闭" _; exit 1
fi
major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 20 ]; then
  echo "[错误] Node.js 版本太旧（当前 $(node -v)），需要 20 或更新。"
  read -r -p "按回车关闭" _; exit 1
fi

if [ ! -d node_modules ]; then
  echo "第一次运行，正在安装依赖（只需一次）..."
  npm ci --no-audit --no-fund || { echo "[错误] 依赖安装失败"; read -r -p "按回车关闭" _; exit 1; }
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已根据 .env.example 生成 .env"
fi

echo
echo "正在启动同屏……这个窗口要一直开着，关掉窗口 = 关掉同屏。"
echo
npm run up
