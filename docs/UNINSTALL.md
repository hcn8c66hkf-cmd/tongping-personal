# 卸载同屏 TongPing 个人版

按顺序做完，电脑上就不会再留下同屏的任何东西。只想「暂时不用」的话，第 1 步停掉就够了。

## 1. 停止同屏

- 在 `npm run up`（或 `启动同屏.cmd`）的窗口按 `Ctrl+C`，或直接关掉窗口。
- 确认停干净：浏览器打开 `http://127.0.0.1:45921/health`，应该**打不开**。
  - 还能打开：Windows 打开任务管理器 →「详细信息」，结束命令行里含 `tongping` 的 `node.exe`；macOS/Linux 运行 `pkill -f tongping`。
- 同时关掉 cloudflared、ngrok 等隧道窗口。

## 2. 断开 AI 的连接

| 客户端 | 操作 |
|---|---|
| claude.ai | 设置 → 连接器 → 找到同屏 → 删除/断开 |
| ChatGPT | 设置 → 应用与连接器 → 找到同屏 → 删除 |
| Claude Code | `claude mcp remove tongping`（添加时用了 `-s user` 就加 `-s user`） |
| Codex | `codex mcp remove tongping` |

## 3. 删除环境变量（只有按 CONNECT.md 给 Codex 设过才需要）

- Windows PowerShell：`[Environment]::SetEnvironmentVariable("TONGPING_TOKEN", $null, "User")`，然后重开终端。
- macOS / Linux：从 `~/.zshrc` 或 `~/.bashrc` 里删掉 `export TONGPING_TOKEN=...` 那行。

## 4. 删除数据目录（登录态、令牌、聊天记录）

> ⚠️ 删除后所有网站都要重新登录，所有连接器都要重新添加。想保留就先复制一份。

| 系统 | 默认位置 |
|---|---|
| Windows | `C:\Users\你的用户名\.tongping` |
| macOS / Linux | `~/.tongping` |

如果你在 `.env` 里设过 `TONGPING_HOME`，删那个目录。

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force "$env:USERPROFILE\.tongping"
```
```bash
# macOS / Linux
rm -rf ~/.tongping
```

提示「文件正在使用」：说明同屏或它开的 Chrome 还在运行，回到第 1 步。

## 5. 删除同屏文件夹

直接删除解压/clone 出来的整个文件夹（包括 `node_modules` 和 `.env`）。

提示「文件夹正在使用」/「另一个程序正在使用此文件」：**关掉所有停在这个文件夹里的终端窗口和 VS Code**（终端的当前目录也会占用文件夹），再删。

本地字幕（如果装过）在 `TONGPING_HOME/asr` 里，会随数据目录一起删掉。下载的语音识别模型在 `~/.cache/huggingface/hub`（Windows：`C:\Users\你的用户名\.cache\huggingface\hub`）下名字含 `faster-whisper` 的文件夹，别的程序没在用的话可以删，能省 0.5–1.6 GB。

## 6.（可选）删除 Playwright 自带的 Chromium

只有执行过 `npx playwright install chromium` 才有。如果别的项目也在用 Playwright，**不要删**。

| 系统 | 位置 |
|---|---|
| Windows | `%LOCALAPPDATA%\ms-playwright` |
| macOS | `~/Library/Caches/ms-playwright` |
| Linux | `~/.cache/ms-playwright` |

## 7.（可选）卸载为同屏安装的软件

Node.js、ffmpeg、cloudflared、ngrok 如果只为同屏而装，可以按各自的方式卸载（Windows「设置 → 应用」；`winget uninstall Gyan.FFmpeg`；`brew uninstall ffmpeg cloudflared ngrok` 等）。别的软件也可能依赖 Node.js，不确定就留着。

## 确认卸载干净

- `http://127.0.0.1:45921/health` 打不开
- `~/.tongping`（或你设的 `TONGPING_HOME`）不存在
- `claude mcp list` / `codex mcp list` 里没有 `tongping`
- claude.ai / ChatGPT 的连接器列表里没有同屏
