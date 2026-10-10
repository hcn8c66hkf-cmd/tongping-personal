# 安装同屏 TongPing 个人版

> 适用版本：`0.4.0-personal.2`。每一步后面都写了「怎么确认成功」，没成功就不要往下走，直接看 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 里同名小节。

总共 7 步，前 5 步装好就能在本机用；第 6 步是给 claude.ai / ChatGPT 网页版用的。

| 步骤 | 内容 | 必需？ |
|---|---|---|
| 1 | 安装 Node.js 20+ | 必需 |
| 2 | 安装 Chrome（或 Edge） | 必需 |
| 3 | 安装 ffmpeg | 陪看 / 语音输入需要 |
| 5b | 安装本地字幕（语音识别） | 可选：让 AI 听懂**没有字幕**的视频 |
| 4 | 下载同屏并安装依赖 | 必需 |
| 5 | 启动 + 自检 | 必需 |
| 6 | 开 HTTPS 隧道（给网页版 AI 用） | 可选 |
| 7 | 接入 AI | 见 [CONNECT.md](CONNECT.md) |

---

## 1. 安装 Node.js 20 或更新版本

- **Windows / macOS**：打开 <https://nodejs.org/zh-cn>，下载 **LTS** 版安装包，一路「下一步」。
  国内下载慢可以用镜像 <https://npmmirror.com/mirrors/node/>（选 `v22.x` 或 `v20.x` 目录里的 `.msi` / `.pkg`）。
- **macOS（Homebrew）**：`brew install node@22`
- **Ubuntu / Debian**：系统自带的 `apt install nodejs` 往往是 18，**太旧**。用 nvm：
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  # 关掉终端重新打开
  nvm install 22
  ```

**确认成功**：**新开**一个终端（Windows 用「PowerShell」或「终端」），输入

```bash
node -v
```

显示 `v20.x.x` 或更高即可。显示 `v18` 或「不是内部或外部命令」→ 看排障手册 [N1](TROUBLESHOOTING.md#n1-node-版本不对或找不到-node)。

## 2. 安装 Chrome（推荐）或 Edge

正常安装桌面版 Google Chrome 即可。同屏会单独开一个**独立的** Chrome 窗口和独立的数据目录，不会碰你平时用的 Chrome 书签和账号。

- 用 Edge：后面 `.env` 里把 `TONGPING_CHANNEL=chrome` 改成 `TONGPING_CHANNEL=msedge`。
- 两个都不想装 / Linux 服务器：在第 4 步装完依赖后运行
  ```bash
  npx playwright install chromium          # Windows / macOS
  npx playwright install --with-deps chromium   # Linux（会用 sudo 装系统库）
  ```
  然后把 `.env` 里 `TONGPING_CHANNEL=chrome` 这一行删掉。

## 3. 安装 ffmpeg

「陪看」（延迟缓冲播放视频）和卡片里的「按住说话」要用 ffmpeg。**不装也能启动**，逛网页、聊天、实时画面都正常，只是陪看会一直显示「缓冲 0 秒」。

- **Windows**（任选一种）
  - 有 winget（Win10/11 一般自带）：在 PowerShell 运行 `winget install Gyan.FFmpeg`
  - 手动：下载 <https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip>，解压到比如 `C:\ffmpeg`，把 `C:\ffmpeg\ffmpeg-版本号-essentials_build\bin` 加入系统环境变量 `Path`（开始菜单搜「编辑系统环境变量」→ 环境变量 → Path → 新建）。
- **macOS**：`brew install ffmpeg`
- **Ubuntu / Debian**：`sudo apt install -y ffmpeg`

**确认成功**：**关掉所有终端窗口，重新打开**，运行 `ffmpeg -version`，第一行显示 `ffmpeg version ...`。
（Windows 改了 Path 之后，已经打开的终端和 VS Code 都看不到新 Path，必须重开。）

## 4. 下载同屏并安装依赖

1. 下载代码：在 GitHub 页面点 **Code → Download ZIP**，解压。或者 `git clone`。
2. 建议放在**简单路径**下，比如 `C:\tongping` 或 `~/tongping`。中文路径和空格路径实测可用，但如果你遇到奇怪的报错，先挪到纯英文路径排除这个因素。
3. 在这个文件夹里打开终端：
   - Windows：在文件夹空白处按住 Shift 右键 →「在终端中打开」/「在此处打开 PowerShell 窗口」
   - macOS：右键文件夹 → 服务 →「新建位于文件夹位置的终端窗口」
4. 运行：

```bash
npm ci
```

国内网络很慢或报 `ETIMEDOUT` / `ECONNRESET`，先换源再装：

```bash
npm config set registry https://registry.npmmirror.com
npm ci
```

**确认成功**：最后一行类似 `added 55 packages in 20s`，文件夹里出现 `node_modules`。

5. 生成配置文件：

```bash
# Windows PowerShell
copy .env.example .env
# macOS / Linux
cp .env.example .env
```

默认配置就能用（使用本机 Chrome）。每一项的含义写在 `.env` 文件的注释里，用记事本打开即可修改。

> Windows 偷懒法：以上 4、5 两步可以直接双击文件夹里的 **`启动同屏.cmd`**，它会自动装依赖、生成 `.env` 并启动。macOS 对应 `start.command`（第一次需在终端运行 `chmod +x start.command`）。

## 5. 启动并自检

```bash
npm run up
```

看到下面这段就是启动成功了，**这个窗口要一直开着**：

```
==============================================
 同屏 TongPing 个人版 已启动
  本机健康检查: http://127.0.0.1:45921/health
  本机 MCP:     http://127.0.0.1:45921/mcp
  ...
```

稍等几秒还会看到 `[worker] Worker paired/authorized. Starting long-poll loop...`，说明 worker 也连上了。

**另开一个终端**（同一个文件夹），运行自检：

```bash
npm run selftest
```

自检会自动打开一个独立的 Chrome 窗口，依次验证：

```
✅ health：daemon 在线，worker 已连接
✅ MCP 握手 + 工具列表
✅ 逛网页：打开页面并读正文
✅ 看视频：打开带视频的页面，读播放状态
✅ 看视频：截一帧画面
✅ 打开同屏卡片（拿到卡片票据）
✅ 看视频：卡片实时画面（WebSocket 连续收帧）
✅ 聊天：AI 发言 → 另一个 AI 读到
✅ 聊天：人在卡片里发消息 → AI 读到
自检全部通过 🎉
```

有 ❌ 就运行 `npm run doctor`，把输出和 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 一起交给 AI。

> 自检用的视频是 MDN 的一段 5 秒 CC0 公开短片。网络打不开 MDN 时可以换一个能直接访问的 `.mp4`：
> `npm run selftest -- --video https://你能访问的地址/xxx.mp4`

**停止同屏**：在 `npm run up` 的窗口按 `Ctrl+C`。

## 5b. 可选：安装本地字幕

陪看时，网页自带字幕（B 站 CC 字幕、YouTube 字幕等）AI 本来就能读。**没有字幕**的视频（很多短视频、直播回放、外语视频），装上本地语音识别后，AI 也能「听」到台词。识别完全在你电脑上进行，声音不会上传。

需要 **Python 3.9–3.14**（没有的话装 <https://www.python.org/downloads/> 的 3.11 或 3.12；Windows 安装时**勾选「Add python.exe to PATH」**，装完重开终端）。

```bash
npm run asr:install            # 能正常访问国外网站（大多数 Claude / ChatGPT 用户）
npm run asr:install -- --cn    # 访问国外网站很慢时（pip 用清华镜像，模型从 hf-mirror.com 下载）
```

- 有 NVIDIA 显卡：自动装 GPU 版，约下载 1.3 GB 运行库 + 1.6 GB 模型（large-v3-turbo），又快又准。
- 没有 N 卡 / Mac：CPU 版，约下载 0.3 GB 运行库 + 0.5 GB 模型（small），实测 44 秒的语音约 21 秒识别完，准确率低一些。
- 强制用 CPU 版：`npm run asr:install -- --cpu`

**确认成功**：最后一行显示 `✅ 字幕服务已就绪：模型 …，设备 cuda/cpu`。然后**重启同屏**（`Ctrl+C` 后再 `npm run up`）。

效果：进入陪看后，AI 读到的字幕会比画面晚约 10–15 秒（每 8 秒识别一段）；刚开始的第一段可能因为模型热身被跳过。不想要了：`npm run asr:install -- --uninstall`。

到这里，本机的 Claude Code / Codex 已经可以接入了 → [CONNECT.md](CONNECT.md)。

## 6.（可选）开 HTTPS 隧道，给 claude.ai / ChatGPT 网页版用

claude.ai 和 ChatGPT 的服务器在云上，它们访问不到你电脑的 `127.0.0.1`。需要一条 **HTTPS 隧道**把本机的 45921 端口转出去。

> ⚠️ 隧道打开期间，任何知道地址的人都能访问到同屏的登录页。同屏用 **OAuth 授权密码** 挡住他们：**一定要设一个 12 位以上的随机密码**，并且不要把隧道地址发到公开场合。

### 方案 A：Cloudflare 临时隧道（免费、免注册，适合先试）

1. 下载 cloudflared：<https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>（Windows 选 `cloudflared-windows-amd64.exe`，可改名为 `cloudflared.exe`）。macOS：`brew install cloudflared`。
2. **先**启动隧道（新开一个终端，窗口保持打开）：
   ```bash
   cloudflared tunnel --url http://127.0.0.1:45921
   ```
   输出里找到一行 `https://xxxx-xxxx-xxxx.trycloudflare.com`，复制它。
3. 编辑 `.env`，取消注释并填写：
   ```ini
   TONGPING_PUBLIC_ORIGIN=https://xxxx-xxxx-xxxx.trycloudflare.com
   TONGPING_OAUTH_PASSWORD=一串12位以上的随机字符
   ```
4. 回到 `npm run up` 的窗口，`Ctrl+C` 停掉，再 `npm run up` 重新启动（**改 .env 必须重启**）。启动信息里会多出一行「公网 MCP 地址」。
5. 运行 `npm run doctor`，确认有 `✅ [tunnel] 公网地址能访问到本机同屏` 和 `✅ [oauth]`。

缺点：**每次重启 cloudflared 地址都会变**，变了就要改 `.env`、重启同屏、并在 Claude/ChatGPT 里删掉旧连接器重新添加。

### 方案 B：固定地址（长期使用推荐）

- **Cloudflare 命名隧道**：需要一个托管在 Cloudflare 的域名。按官方文档创建 tunnel，把一个子域名（如 `tongping.你的域名.com`）指向 `http://127.0.0.1:45921`。
- **Tailscale Funnel**：免费，地址固定为 `https://电脑名.xxx.ts.net`。安装 Tailscale 并登录后运行 `tailscale funnel 45921`（具体以 Tailscale 官方文档为准）。

拿到固定的 `https://` 地址后，同样填进 `TONGPING_PUBLIC_ORIGIN`，重启同屏，用 `npm run doctor` 确认。

> 不推荐 ngrok 免费版：它会给浏览器请求插一个警告页，导致卡片画面加载失败。

## 7. 接入 AI

见 **[CONNECT.md](CONNECT.md)**。

---

## 附：所有会被创建的东西（卸载时用）

| 位置 | 内容 |
|---|---|
| 同屏文件夹本身 | 代码、`node_modules`、`.env` |
| `TONGPING_HOME`（默认 `~/.tongping`，Windows 即 `C:\Users\你的用户名\.tongping`） | `daemon/`：令牌、OAuth 记录、陪看缓冲；`worker/`：浏览器 profile（**登录态和 cookie**） |
| Playwright Chromium（只有执行了 `npx playwright install` 才有） | Windows `%LOCALAPPDATA%\ms-playwright`，macOS `~/Library/Caches/ms-playwright`，Linux `~/.cache/ms-playwright` |
| 你自己装的 Node.js / ffmpeg / cloudflared | 按各自方式卸载 |

卸载步骤见 [UNINSTALL.md](UNINSTALL.md)。
