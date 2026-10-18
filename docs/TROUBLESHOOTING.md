# 同屏 TongPing 个人版 · AI 排障手册

> 适用版本：`0.4.0-personal.2`
>
> **给用户**：出问题时，把下面两样一起发给你的 AI（Claude / ChatGPT / Codex 都可以）：
> 1. 这个文件（或者它的链接）
> 2. `npm run doctor` 输出的整段「诊断摘要」，以及 `npm run up` 窗口里**出错前后几十行**日志
>
> 然后说：「请按这份手册帮我排查同屏」。

---

## 第 0 部分：给 AI 的规则（AI 请先读完这一节）

你正在帮一位**可能完全不懂命令行**的用户排查自己电脑上的同屏。请遵守：

1. **先要证据再下结论。** 第一步永远是让用户运行 `npm run doctor` 并贴出「诊断摘要」。看到 `❌` 先处理 `❌`，按从上到下的顺序，一次只改一处。
2. **绝不索要秘密。** 不要让用户发 `daemon-token`、`TONGPING_OAUTH_PASSWORD`、`TONGPING_TOKEN`、cookie、`TONGPING_HOME` 里的任何文件内容。doctor 摘要已打码，够用了。用户主动贴了令牌，提醒他：删掉 `TONGPING_HOME/daemon/daemon-token` 后重启即可换新令牌。
3. **不要建议降低安全性来「修好」问题。** 禁止建议：把 `TONGPING_HOST` 改成 `0.0.0.0`、在路由器上做端口映射、去掉 OAuth 密码、关闭系统防火墙、用管理员权限运行。正确做法是 HTTPS 隧道 + 授权密码。
4. **改了 `.env` 一定要重启。** 让用户在 `npm run up` 窗口按 `Ctrl+C`，再运行 `npm run up`。很多「改了没用」都是没重启。
5. **命令要给全，并说明在哪运行。** 用户分不清 PowerShell / cmd / 终端。默认用户在**同屏文件夹**里打开的终端里运行；Windows 命令给 PowerShell 版本。
6. **区分平台。** 下面写明了 claude.ai 和 ChatGPT 的差异（第 3 部分 C 节）。不要把一家的解决办法套到另一家。
7. **不确定就说不确定**，并告诉用户下一步需要什么信息（例如 `/health` 里的某个字段）。
8. 修好之后，让用户再跑一次 `npm run selftest` 确认。

---

## 第 1 部分：系统地图（AI 推理用）

```
claude.ai / ChatGPT ──HTTPS 隧道──► daemon :45921 ◄── 本机 Claude Code / Codex（Bearer 令牌）
                                       │  /mcp     MCP（Streamable HTTP）
                                       │  /oauth/* OAuth 2.1 + 动态注册（只在设了公网地址+密码时开启）
                                       │  /health  状态 JSON（无需认证）
                                       │  /live    手机网页接管
                                       │  /v1/app/* 卡片用的 ticket 接口和 WebSocket（live-ws / audio-ws / media-ws）
                                       │  /v1/worker/* worker 长轮询（Worker 令牌）
                                       ▼ 127.0.0.1
                                     worker ──► 真实 Chrome（独立 profile）
                                       └─ 录制标签页画面/声音 → daemon → ffmpeg → 陪看 HLS
```

| 事实 | 值 |
|---|---|
| 启动入口 | `npm run up` = `scripts/start.mjs`，同时起 daemon 和 worker，日志前缀 `[daemon]` / `[worker]` |
| 默认端口 | `45921`（`TONGPING_PORT`） |
| 数据目录 | `TONGPING_HOME`，默认 `~/.tongping`；`daemon/` 和 `worker/` 两个子目录 |
| daemon 令牌 | `TONGPING_HOME/daemon/daemon-token` |
| worker 令牌 | `TONGPING_HOME/daemon/worker-auth/worker-token`（启动器自动传给 worker） |
| OAuth 数据 | `TONGPING_HOME/daemon/oauth-store.json` |
| 浏览器 profile | `TONGPING_HOME/worker/profiles/<profile名>` |
| 审计日志 | `TONGPING_HOME/worker/audit/actions.jsonl`（不含输入的文字内容） |
| 群聊记录 | `TONGPING_HOME/daemon/app-chat-room.json` |
| 配置 | 项目根目录 `.env`；shell 里已设置的变量优先 |
| 外部依赖 | Node.js ≥ 20；Chrome/Edge 或 Playwright Chromium；ffmpeg（陪看、语音输入） |
| 无需认证的探针 | `GET http://127.0.0.1:45921/health` |

`/health` 关键字段：

| 字段 | 含义 |
|---|---|
| `version` | 正在运行的版本，应等于 `package.json` |
| `oauth` | `true` = OAuth 已开启（设了公网地址和密码） |
| `worker.connected` / `workerBuild` | worker 是否连上、worker 协议版本（本版为 `v84`） |
| `liveWs.appRejectedTicket` / `appRejectedCard` | 卡片实时画面被拒：票据过期 / 有更新的卡片在用 |
| `mediaWs.segmentsDroppedNoViewer` | worker 在录，但没有卡片在陪看 |
| `delayedCompanion.active` / `recentExits` | 陪看的 ffmpeg 会话数 / 最近退出记录（`exitCode≠0` 才是异常） |
| `companionCommand.lastError` | 最近一次开启陪看录制的错误 |

---

## 第 2 部分：症状索引

| 用户看到的 | 去看 |
|---|---|
| `node` 不是内部或外部命令 / `v18.x` | [N1](#n1-node-版本不对或找不到-node) |
| PowerShell：`npm.ps1，因为在此系统上禁止运行脚本` | [N2](#n2-powershell-禁止运行-npmps1) |
| `npm ci` 卡住、`ETIMEDOUT`、`ECONNRESET`、`ERR_SOCKET_TIMEOUT` | [N3](#n3-npm-ci-网络失败) |
| `npm ci` 报 `EUSAGE` / `package-lock.json` 不一致 | [N4](#n4-npm-ci-报-lock-文件问题) |
| `EADDRINUSE` / `端口 ... 被别的程序占用` | [P1](#p1-端口被占用) |
| `daemon lock already exists` | [P2](#p2-daemon-lock-already-exists) |
| `Executable doesn't exist` / `Chromium distribution 'chrome' is not found` | [B1](#b1-找不到浏览器) |
| `ProcessSingleton` / `user data directory is already in use` / 浏览器窗口一闪就关 | [B2](#b2-浏览器-profile-被占用) |
| Linux：`Host system is missing dependencies` / `libnss3.so` | [B3](#b3-linux-缺系统库) |
| `local worker did not answer in time` / `launchPersistentContext: Timeout 180000ms exceeded` | [B4](#b4-打开浏览器超时) |
| `[worker] ... HTTP 401: Unauthorized worker` | [W1](#w1-worker-401-unauthorized-worker) |
| doctor：`worker 没连上 daemon` | [W2](#w2-worker-没连上) |
| 自检「逛网页」失败 / 超时 | [S1](#s1-自检逛网页失败) |
| 自检「看视频」播放时间不前进 | [S2](#s2-自检看视频不前进) |
| 自检「卡片实时画面」帧数为 0 或很少 | [S3](#s3-实时画面帧数为-0) |
| 陪看一直「缓冲 0 秒」/ 卡在准备中 | [F1](#f1-陪看缓冲一直是-0-秒) |
| 陪看能放但卡顿、反复从头放 | [F2](#f2-陪看卡顿重复) |
| 卡片「按住说话」没反应 | [F3](#f3-按住说话不可用) |
| 没字幕的视频 AI 读不到台词 / `npm run asr:install` 失败 | [F4](#f4-本地字幕语音识别) |
| 群聊：别的 AI 不回 / 回复没进群 / 身份不对 | [GROUP-CHAT.md 第 6 节](GROUP-CHAT.md#6-常见问题)，以及 [C4](#c4-群聊身份不对) |
| doctor：`公网地址访问不到` | [T1](#t1-公网地址访问不到) |
| 公网地址返回 `403` / `Invalid Host` | [T2](#t2-403--invalid-host) |
| 昨天能用今天连不上（临时隧道） | [T3](#t3-临时隧道地址变了) |
| 授权页「密码不对」/「尝试次数过多」 | [O1](#o1-授权密码错误--尝试次数过多) |
| Claude/ChatGPT 添加连接器失败 / 一直 401 | [O2](#o2-添加连接器失败或一直-401) |
| claude.ai：`Failed to load this connector` / 卡片空白 | [C1](#c1-claudeai-卡片加载失败) |
| ChatGPT：卡片 `Load failed` / 工具不出现 | [C2](#c2-chatgpt-卡片或工具问题) |
| 卡片画面黑屏 / 定格 / 一直「连接中」 | [C3](#c3-卡片黑屏或定格) |
| 群聊里身份显示错（Claude 显示成 gpt.chat 等） | [C4](#c4-群聊身份不对) |
| AI 说「你把我静音了」/ 发不了群聊 | [C5](#c5-ai-被静音) |
| `... are stopped for this profile` / `site_risk_human_required` / `site_risk_cooldown` | [R1](#r1-网站风控冻结) |
| `High-risk click blocked` / 需要审批 | [R2](#r2-付款删除等高风险点击被拦) |
| `Profile ... is under human takeover` | [R3](#r3-ai-说正在人工接管) |
| AI 操作很慢 / 超时 | [X1](#x1-操作慢或超时) |
| 电脑锁屏后陪看断了 | [X2](#x2-锁屏后陪看中断) |

---

## 第 3 部分：逐条处理

### N 安装

#### N1 Node 版本不对或找不到 node
- 现象：`node -v` 报找不到，或显示 `v18.x`。启动器报 `需要 Node.js 20 或更新版本`。
- 处理：按 [INSTALL.md 第 1 步](INSTALL.md#1-安装-nodejs-20-或更新版本) 安装 LTS。装完**关掉所有终端重开**。
- Linux 特别注意：`apt install nodejs` 常装到 18，必须用 nvm 或 NodeSource。
- **`npm ci` 在 Node 18 上也会显示成功**，不代表能用；之后 `npm run up` 会报「需要 Node.js 20」，Playwright 会报 `Playwright requires Node.js 20 or higher`。以 `node -v` 和 `npm run doctor` 第一行为准。
- 装了新版但 `node -v` 还是旧的：PATH 里有旧 Node。Windows 运行 `where.exe node`，macOS/Linux 运行 `which -a node`，看排在第一个的是谁，卸掉旧的。

#### N2 PowerShell 禁止运行 npm.ps1
- 现象：`无法加载文件 C:\Program Files\nodejs\npm.ps1，因为在此系统上禁止运行脚本`。
- 处理（任选）：
  - 只对当前用户放开：`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，输入 `Y`。
  - 不改策略：把命令里的 `npm` 换成 `npm.cmd`，例如 `npm.cmd ci`、`npm.cmd run up`。
  - 或者直接双击 `启动同屏.cmd`（它用 cmd，不受这个限制）。

#### N3 npm ci 网络失败
- 处理：`npm config set registry https://registry.npmmirror.com` 后重试 `npm ci`。
- 公司网络/代理：`npm config set proxy http://代理地址:端口` 和 `https-proxy`。
- 中途失败后：删除 `node_modules` 文件夹再 `npm ci`。

#### N4 npm ci 报 lock 文件问题
- 现象：`npm ci can only install packages when your package.json and package-lock.json are in sync`。
- 原因：用户改过 `package.json`，或者从别处混拷了文件。
- 处理：重新下载完整的发布包。不要用 `npm install` 绕过（会改 lock，之后排障对不上版本）。

### P 端口与进程

#### P1 端口被占用
- 现象：`EADDRINUSE`，或 doctor 报 `端口 45921 被别的程序占用，但不是同屏`。
- 先确认是不是**上一次的同屏没关**：`http://127.0.0.1:45921/health` 能打开且 `service` 是 `tongping` → 就是它在运行，找到那个窗口 `Ctrl+C`。
- 查是谁占用：Windows `netstat -ano | findstr :45921`，最后一列是 PID，在任务管理器「详细信息」里按 PID 找；macOS/Linux `lsof -i :45921`。
- 或换端口：`.env` 里 `TONGPING_PORT=46921`，重启。**注意**：换端口后本机客户端（Claude Code / Codex）里的地址也要改，隧道命令里的端口也要改。

#### P2 daemon lock already exists
- 现象：`tongping daemon lock already exists at ... Stop the existing daemon before starting another one.`
- 原因：已经有一个 daemon 在用同一个 `TONGPING_HOME`。
- 处理：关掉另一个同屏窗口。确定没有在运行（任务管理器里没有相关 node 进程）还报错，删除 `TONGPING_HOME/daemon/daemon.lock` 后重启。

### B 浏览器

#### B1 找不到浏览器
- 现象：`Chromium distribution 'chrome' is not found`（设了 `TONGPING_CHANNEL=chrome` 但没装 Chrome），或 `Executable doesn't exist at ...ms-playwright...`（没设 channel 也没装 Playwright Chromium）。
- 处理二选一：
  - 装 Chrome，`.env` 保持 `TONGPING_CHANNEL=chrome`（用 Edge 写 `msedge`）；
  - 或在同屏目录运行 `npx playwright install chromium`，并删掉 `.env` 里 `TONGPING_CHANNEL` 那行。
- 国内下载 Playwright Chromium 很慢：优先用本机 Chrome。

#### B2 浏览器 profile 被占用
- 现象：`ProcessSingleton`、`user data directory is already in use`，或同屏的 Chrome 窗口一闪即关。
- 原因：同一个 profile 目录被两个浏览器进程打开。常见于：手动用 Chrome 打开了 `TONGPING_HOME/worker/profiles/...`，或上一次同屏异常退出留下了 Chrome 进程。
- 处理：关掉同屏 → 在任务管理器结束命令行里含 `.tongping` 的 `chrome.exe` → 重启同屏。
- 不要让 daemon 和 worker 共用同一个 `TONGPING_HOME` 根目录手动启动；用 `npm run up`，它会自动分成 `daemon/` 和 `worker/`。

#### B3 Linux 缺系统库
- 处理：`npx playwright install-deps chromium`（需要 sudo），或 `npx playwright install --with-deps chromium`。
- 没有桌面环境的 Linux：设 `TONGPING_HEADLESS=1`。无窗口模式下陪看录制与人工接管登录**未经验证**。

#### B4 打开浏览器超时
- 现象：`browser_open` 报 `同屏 local worker did not answer in time`，worker 日志里是 `launchPersistentContext: Timeout 180000ms exceeded`，之后可能出现 `worker result HTTP 409`。
- 含义：Chrome 进程起来了，但一直没有进入可控制状态。
- 处理（按顺序）：
  1. 再试一次（`npm run selftest` 已内置自动重试一次）。
  2. 任务管理器里结束命令行含 `.tongping` 的残留 `chrome.exe`（见 [B2](#b2-浏览器-profile-被占用)），再重启同屏。
  3. 杀毒软件 / 公司安全软件可能拦截「被程序控制的 Chrome」：把同屏文件夹和 `TONGPING_HOME` 加白名单再试。
  4. 换用 Playwright Chromium 对比（[B1](#b1-找不到浏览器) 第二种做法），能用就说明是本机 Chrome 的问题。
  5. 技术备注：如果有人为了测试改过 `USERPROFILE`，指向的目录里必须有 `AppData\Local` 和 `AppData\Roaming`，否则 Windows 版 Chrome 会一直卡在启动。
- `HTTP 409` 本身无害：是超时后迟到的结果被 daemon 丢弃了。

### W worker

#### W1 worker 401 Unauthorized worker
- 现象：`[worker] worker loop: worker poll HTTP 401: {"ok":false,"error":"Unauthorized worker"}` 刷屏。
- 原因：没用 `npm run up`，而是分别手动启动了 daemon 和 worker，缺少私有单用户配对开关或令牌不一致。
- 处理：关掉所有同屏进程，只用 `npm run up` 启动。（启动器会设置 `TONGPING_REMOTE_WORKER=1`、`TONGPING_DEPLOYMENT_MODE=private-single-user`、`TONGPING_PAIRING_AUTHORITY=private-single-user`，并把 `daemon/worker-auth/worker-token` 传给 worker。）

#### W2 worker 没连上
- 看 `npm run up` 窗口里 `[worker]` 开头的行。最常见是 [B1](#b1-找不到浏览器) / [B2](#b2-浏览器-profile-被占用)。
- worker 进程退出时启动器会把整个同屏一起停掉，并打印 `[worker] 已退出（code=...）`，往上翻找第一条报错。

### S 自检

#### S1 自检逛网页失败
- 自检默认打开 `https://example.com/`。打不开说明这台电脑访问不了该网站（网络/代理问题），不是同屏的问题。
- 换一个能访问的网址：`npm run selftest -- --page https://www.baidu.com/`（此时自检只检查读到了内容）。

#### S2 自检看视频不前进
- 默认视频是 MDN 的 5 秒 CC0 短片。网络打不开就换一个直链 mp4：`npm run selftest -- --video https://你能访问的/xxx.mp4`。
- 视频能打开但 `paused=true`：Chrome 自动播放被策略拦住了。同屏会尝试点击播放；仍不行可在同屏的 Chrome 窗口里手动点一下播放再重跑。

#### S3 实时画面帧数为 0
- 先看 `health.workerBuild`：必须是 `v84`（低于 `v19` 不提供实时画面）。不对说明 daemon 和 worker 不是同一份代码，按 [UPGRADE.md](UPGRADE.md) 重装。
- 页面完全静止时帧率会很低，这是正常的；自检打开的是视频页，应 ≥5 帧/6 秒。
- 电脑锁屏、最小化同屏的 Chrome 窗口，都可能让 Chrome 停止渲染。

### F 陪看 / ffmpeg / 语音

#### F1 陪看缓冲一直是 0 秒
- **最常见原因：没装 ffmpeg，或装了但 PATH 没生效。** 这种情况下不会有任何报错，只是缓冲永远为 0。
- 确认：`npm run doctor` 是否有 `⚠️ [ffmpeg]`；启动时是否打印「提示：没找到 ffmpeg」。
- 处理：按 [INSTALL.md 第 3 步](INSTALL.md#3-安装-ffmpeg) 安装，**关掉所有终端重开**，再 `npm run up`。
- 已经有 ffmpeg 仍为 0：看 `/health` 的 `companionCommand.lastError` 和 `delayedCompanion.recentExits[].stderrTail`。
- 注意：陪看默认延迟 30 秒播放（这样 AI 读到的字幕/画面不会剧透你还没看到的内容），刚开始的半分钟里「准备中」是正常的。

#### F2 陪看卡顿/重复
- 上行带宽或 CPU 不够：同屏会自动从高质量降到安全档。关掉其他占资源的程序。
- `recentExits` 里频繁出现 `exitCode≠0`：把 `stderrTail` 发给 AI。
- `mediaWs.streamStarts` 一直增长：录制在反复重启，通常是锁屏（见 [X2](#x2-锁屏后陪看中断)）或页面里视频被替换（换集、广告）。

#### F3 按住说话不可用
- 需要 ffmpeg + SiliconFlow 的 key：`.env` 设 `TONGPING_SILICONFLOW_KEY=...`，或把 key 存到 `TONGPING_HOME/daemon/siliconflow.key`。
- 宿主（Claude/ChatGPT 的 App）可能不给卡片麦克风权限，这种情况无法在同屏侧修复。

#### F4 本地字幕（语音识别）
- 没装：网页自带字幕照常可读；没有字幕的视频 AI 读不到台词。安装见 [INSTALL.md 5b](INSTALL.md#5b-可选安装本地字幕)。
- `没找到 Python 3.9–3.14`：装 Python 3.11/3.12（Windows 勾选 Add to PATH），重开终端。注意有些软件会自带一个精简版 Python（没有 venv 模块），安装器会自动跳过它们。
- pip 下载慢/失败：加 `--cn`。
- `模型加载失败` 且提到 huggingface / Connection / timed out：国内连不上 huggingface.co，用 `npm run asr:install -- --cn`（会在 `.env` 写入 `HF_ENDPOINT=https://hf-mirror.com`）。
- `open() got an unexpected keyword argument 'metadata_errors'`：PyAV 版本太新。安装器已固定 `av<19`；手动装过的话重新运行 `npm run asr:install`。
- `cuda unavailable, using cpu`：显卡驱动太旧或不是 NVIDIA，会自动退回 CPU，能用但慢；更新显卡驱动后重装即可。
- 装好了还是没台词：①装完要**重启同屏**；②只在**陪看**时识别；③视频本身有字幕轨时优先用字幕轨；④声音太小（几乎静音）的片段会被跳过；⑤字幕比画面晚 10–15 秒是正常的。
- 位置：`TONGPING_HOME/asr`（虚拟环境 + `asr_server.py`）；模型缓存在 `~/.cache/huggingface`。卸载：`npm run asr:install -- --uninstall`。

### T 隧道

#### T1 公网地址访问不到
- 隧道窗口是否还开着？cloudflared 的窗口关了隧道就断了。
- 隧道指向的端口是否和 `TONGPING_PORT` 一致（默认 `http://127.0.0.1:45921`）。
- `.env` 里的 `TONGPING_PUBLIC_ORIGIN` 是否和隧道当前显示的地址**完全一致**（`https://`、无路径、无结尾斜杠）。
- 在手机流量下用浏览器打开 `https://你的地址/health`，能看到 JSON 说明隧道是通的。

#### T2 403 / Invalid Host
- 原因：请求的 Host 不在白名单里。`npm run up` 会自动把 `TONGPING_PUBLIC_ORIGIN` 的域名加进去。
- 如果用户在 `.env` 里**手动写了** `TONGPING_ALLOWED_HOSTS` / `TONGPING_ALLOWED_ORIGINS`，自动添加就不生效了——要么删掉这两行，要么把隧道域名补进去（保留 `localhost,127.0.0.1,[::1]`）。

#### T3 临时隧道地址变了
- `trycloudflare.com` 的地址每次启动 cloudflared 都会变。
- 处理：更新 `.env` 的 `TONGPING_PUBLIC_ORIGIN` → 重启同屏 → **在 Claude 和 ChatGPT 里都删掉旧连接器，用新地址重新添加并重新输入密码**。
- 长期使用可改用 `启动同屏和固定隧道.cmd`。它会用 ngrok 账号绑定的固定开发域名，并自动更新 `.env`（[INSTALL.md 方案 B](INSTALL.md#方案-bngrok-固定地址--一键启动长期使用推荐)）。

### O OAuth 授权

#### O1 授权密码错误 / 尝试次数过多
- 密码就是 `.env` 里 `TONGPING_OAUTH_PASSWORD` 的值（不含引号）。改过密码要重启同屏。
- 同一来源 10 分钟内错 10 次会被锁，提示「尝试次数过多，请稍后再试」，等 10 分钟或重启同屏。

#### O2 添加连接器失败或一直 401
- doctor 里 `health.oauth` 必须是 `true`。是 `false` → `.env` 缺公网地址或密码，或改完没重启。
- 连接器 URL 必须以 **`/mcp`** 结尾：`https://你的地址/mcp`。
- 换过隧道地址、换过端口、删过 `TONGPING_HOME`、或删过 `oauth-store.json` → 旧授权全部失效，删掉连接器重新添加。
- 本机 Claude Code / Codex 报 401：令牌不对或 daemon 重新生成过令牌（删过 `daemon-token`），重新复制令牌更新配置（[CONNECT.md](CONNECT.md)）。

### C 卡片与聊天（Claude / ChatGPT 差异在这里）

#### C1 claude.ai 卡片加载失败
- claude.ai 规则：卡片元数据**不能**带 `domain`、**不能**带任何 `openai/*` 键，否则**所有**卡片都报 `Failed to load this connector`。同屏按 OAuth 回调地址识别 claude.ai 后会自动去掉它们。
- 所以：claude.ai 必须通过**自己的** OAuth 授权流程连接（在 claude.ai 设置里添加连接器、输入密码）。不要用别的方式（比如手工带令牌）接入 claude.ai。
- 不要设置 `TONGPING_UI_DOMAIN`，除非你确定 ChatGPT 需要它；它对 claude.ai 无效（会被去掉），但会让排障更复杂。
- 卡片能出来但空白：确认对话里连接器是开启状态；新开一个对话再说「打开同屏」；手机 App 先在网页端试。

#### C2 ChatGPT 卡片或工具问题
- 工具完全不出现：开发者模式没开，或这次对话没在「+」菜单里选中同屏。
- 卡片偶尔显示 `Load failed` 但画面在动：已知是部分 ChatGPT 宿主把后台刷新调用误报为失败，可忽略；画面也不动再看 [C3](#c3-卡片黑屏或定格)。
- 同一张卡片在网页和手机同时打开：允许，最多 6 个并发观看。

#### C3 卡片黑屏或定格
- `/health` 的 `liveWs.appRejectedTicket` 在涨：卡片票据过期（卡片放置太久）。让 AI 重新「打开同屏」，或点卡片里的刷新。
- `liveWs.appRejectedCard` 在涨：**只有最新打开的卡片**能看实时画面；旧卡片会被拒绝。关掉旧卡片 20 秒后自动释放。
- `worker.connected=false`：见 [W2](#w2-worker-没连上)。
- 本机网络切换（换 Wi-Fi、开关代理）后，临时隧道可能断开，见 [T1](#t1-公网地址访问不到)。

#### C4 群聊身份不对
- 身份由每个 AI 调用时自己传：`claude.chat`（claude.ai）、`claude.code`（Claude Code）、`gpt.chat`（ChatGPT）、`gpt.codex`（Codex）。同一入口第二个会话加 `-2`。
- 没传时默认：claude.ai 来的是 `claude.chat`，其他都是 `gpt.chat`。所以 **Claude Code 忘了传身份会显示成 gpt.chat**——让它「用 claude.code 身份发」。
- 人在卡片里说的话，AI 读到的发送者是 `user`。

#### C5 AI 被静音
- 卡片里可以把某个 AI 静音；被静音的 AI 调 `browser_app_chat_push` 会失败。到卡片群聊的成员列表里取消静音。

### R 安全策略（这些是保护，不是故障）

#### R1 网站风控冻结
- `site_risk_human_required` / `... are stopped for this profile`：同屏检测到小红书、抖音等出现验证码、风控、要求登录的页面，**停止 AI 在该网站的写操作**（点击、输入等），以免账号被封。
- 处理：在卡片点「我来操作」，亲手完成验证/登录，页面恢复正常后点「还给模型」，冻结会自动解除（冻结只在内存里，重启同屏也会清除）。
- `site_risk_cooldown`：AI 在该网站的操作频率超出预算（所有 AI 共享），等提示里的时间再试。**不要**想办法绕过，频率限制就是为了保护你的账号。

#### R2 付款、删除等高风险点击被拦
- 现象：`Blocked high-risk click target` / `Use browser_request_click_approval`。
- 这是设计：购买、支付、转账、删除账号等点击需要你**逐次批准**。AI 会发起审批请求，你在 `/live` 页面（或卡片）里批准或拒绝。每个批准只能用一次，页面变了要重新申请。

#### R3 AI 说正在人工接管
- `Profile ... is under human takeover`：有人点了「我来操作」还没还回去。点「还给模型」。

### X 其他

#### X1 操作慢或超时
- 正常的单次操作在几百毫秒到几秒。经过隧道的 claude.ai/ChatGPT 会更慢。
- 电脑休眠、CPU 占满、同时开很多 profile 都会变慢。用完的 profile 让 AI 调 `browser_close_profile` 关掉。

#### X2 锁屏后陪看中断
- Windows 锁屏后 Chrome 无法继续录制标签页，卡片会提示「电脑好像锁屏了」。解锁后会自动恢复；长时间陪看请调整电源设置，不要自动锁屏/睡眠。

---

## 第 4 部分：常见问题（FAQ）

**Q：同屏会不会动我平时用的 Chrome？**
不会。同屏用自己的数据目录启动一个独立的 Chrome 窗口，你平时的书签、密码、扩展都不受影响。

**Q：我在同屏里登录的账号安全吗？**
登录态只存在你电脑的 `TONGPING_HOME/worker/profiles` 里。AI 不能往密码框输入内容（会被拒绝），登录请用「我来操作」自己输入。不要把 `TONGPING_HOME` 发给任何人。

**Q：可以几个 AI 一起用吗？**
可以。Claude、ChatGPT、Claude Code、Codex 可以同时连接，共用一个浏览器和群聊。不同 AI 同时操作同一个 profile 时，动作会排队依次执行。

**Q：可以用多个账号吗？**
用不同的 profile 名，比如让 AI「用 profile xiaohongshu2 打开小红书」。每个 profile 有独立 cookie。

**Q：电脑关机了还能用吗？**
不能。个人版跑在你自己的电脑上，电脑关机/休眠/同屏窗口关掉，AI 就连不上了。

**Q：为什么 claude.ai 和 ChatGPT 要分别登录一次？**
两家对卡片格式要求不同，同屏在授权时识别是谁来连接，并给出对应格式（见 [CONNECT.md](CONNECT.md#claude-和-chatgpt-的差异重要排障时先看这里)）。

**Q：能不能部署到云服务器上给别人用？**
个人版只为「一个人、一台自己的电脑」设计和测试。多人共用涉及账号隔离、鉴权、限流，不在本版本范围内。

**Q：怎么知道我在用哪个版本？**
`npm run doctor` 第一行，或打开 `http://127.0.0.1:45921/health` 看 `version`。

---

## 第 5 部分：仍然解决不了

把以下内容整理好再求助（**务必检查里面没有令牌、密码、cookie**）：

1. `npm run doctor` 的完整诊断摘要
2. `npm run up` 窗口里出错前后约 50 行日志
3. 你做了什么操作、期望什么、实际发生什么
4. 用的是哪个 AI（claude.ai / ChatGPT / Claude Code / Codex）和哪个系统
