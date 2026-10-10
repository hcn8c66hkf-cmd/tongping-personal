# 把同屏接到你的 AI 上

前提：`npm run up` 正在运行，`npm run selftest` 全部通过。

| 你用的是 | 走哪条路 | 要隧道吗 | 认证方式 |
|---|---|---|---|
| Claude Code（终端） | 本机 HTTP | 不要 | daemon 令牌 |
| Codex CLI / Codex App | 本机 HTTP | 不要 | daemon 令牌 |
| claude.ai 网页 / Claude 手机 App / Claude Desktop | 公网 HTTPS | **要** | OAuth 授权密码 |
| ChatGPT 网页 / 手机 App | 公网 HTTPS | **要** | OAuth 授权密码 |

> 同一个同屏可以**同时**接多个 AI，它们共享同一个浏览器和同一个群聊房间。
>
> 本项目只针对上表四种官方客户端测试。其他 AI（Kimi、各类桌面客户端、自建前端）见 [OTHER-CLIENTS.md](OTHER-CLIENTS.md)。

---

## 先拿到 daemon 令牌（本机客户端用）

令牌文件在 `TONGPING_HOME/daemon/daemon-token`，默认：

- Windows：`C:\Users\你的用户名\.tongping\daemon\daemon-token`
- macOS / Linux：`~/.tongping/daemon/daemon-token`

用记事本打开，里面一行字符串就是令牌。`npm run up` 启动时也会打印这个文件的路径。

> 令牌 = 完全控制你这个浏览器的钥匙。**不要发给任何人，不要贴到聊天里，不要提交到 git。** 怀疑泄露就删掉这个文件，重启同屏会生成新的（之后所有本机客户端要更新令牌）。

---

## Claude Code

```bash
claude mcp add --transport http tongping http://127.0.0.1:45921/mcp --header "Authorization: Bearer 这里换成你的令牌"
```

- 想在所有项目里都能用，加 `-s user`：`claude mcp add -s user --transport http tongping ...`
- **确认成功**：`claude mcp list` 里显示 `tongping: http://127.0.0.1:45921/mcp (HTTP) - ✔ Connected`。
- 在 Claude Code 里说「用同屏打开 https://example.com 读给我听」即可。
- 群聊时 Claude Code 的身份是 `claude.code`。服务器会提醒 AI 自己传身份；如果它在群里显示成 `gpt.chat`，让它「用 claude.code 身份发」。

## Codex

```bash
# 先把令牌放进环境变量（Windows PowerShell 用 setx，设完要重开终端）
setx TONGPING_TOKEN "这里换成你的令牌"          # Windows
export TONGPING_TOKEN="这里换成你的令牌"        # macOS / Linux，建议写进 ~/.zshrc 或 ~/.bashrc

codex mcp add tongping --url http://127.0.0.1:45921/mcp --bearer-token-env-var TONGPING_TOKEN
```

- **确认成功**：`codex mcp list` 里 `tongping` 的 Status 是 `enabled`、Auth 是 `Bearer token`；然后在 Codex 里让它调用 `browser_profiles`。
- 群聊身份是 `gpt.codex`。

---

## claude.ai（网页 / 手机 App / Desktop）

需要先完成 [INSTALL.md 第 6 步](INSTALL.md#6可选开-https-隧道给-claudeai--chatgpt-网页版用)：`.env` 里有 `TONGPING_PUBLIC_ORIGIN` 和 `TONGPING_OAUTH_PASSWORD`，并且 `npm run doctor` 显示 `✅ [tunnel]`。

1. 打开 claude.ai → 左下角头像 → **设置（Settings）→ 连接器（Connectors）→ 添加自定义连接器（Add custom connector）**。
   （入口名称和套餐限制以 Anthropic 官方页面为准，界面可能调整。）
2. 名称随便填，比如「同屏」；URL 填 **`https://你的隧道地址/mcp`**（注意结尾有 `/mcp`）。
3. 点添加后会跳出同屏的授权页，输入 `TONGPING_OAUTH_PASSWORD`。
4. 新开一个对话，在输入框的工具 / 连接器菜单里确认「同屏」是打开的，然后说：**「打开同屏」**。
5. 看到同屏卡片（有画面、有群聊框）就成功了。

Claude Desktop 和 Claude 手机 App 用的是同一个账号的连接器，网页上加好后它们会自动同步，不需要另外配置。

## ChatGPT（网页 / 手机 App）

同样先完成隧道配置。

1. ChatGPT → **设置（Settings）→ 应用与连接器（Apps & Connectors）→ 高级设置（Advanced）→ 打开开发者模式（Developer mode）**。
   （开发者模式的套餐要求和入口位置以 OpenAI 官方说明为准。）
2. 回到「应用与连接器」→ **创建（Create）**：
   - MCP 服务器 URL：**`https://你的隧道地址/mcp`**
   - 认证方式（Authentication）：**OAuth**
   - 勾选「我信任此应用」之类的确认项
3. 弹出同屏授权页，输入 `TONGPING_OAUTH_PASSWORD`。
4. 新开对话，在输入框 **「+」→ 开发者模式 / 更多** 里选中同屏，再说「打开同屏」。

---

## Claude 和 ChatGPT 的差异（重要，排障时先看这里）

同屏**用同一个 URL** 同时服务两家，但两家对卡片（MCP Apps / Apps SDK）的规则不一样。同屏会在 OAuth 登录时根据回调地址自动判断对方是谁，然后给出不同的卡片元数据：

| 项目 | claude.ai | ChatGPT |
|---|---|---|
| 识别方式 | OAuth 回调地址是 `claude.ai` | 其他（默认按 ChatGPT 处理） |
| 卡片元数据 | **不能**带 `domain`、**不能**带任何 `openai/*` 键，否则所有卡片都报 *Failed to load this connector* | 需要 `openai/outputTemplate` |
| 默认群聊身份 | `claude.chat` | `gpt.chat` |
| 工具结果大小 | 结果太大会让卡片加载器崩溃，同屏已把结果控制得很小 | 较宽松 |
| 卡片挂载 | 一张卡片一个 iframe | 可能同时挂多个 iframe（网页 + 手机），同屏允许最多 6 个并发观看 |
| 卡片里的「刷新」 | 正常 | 部分版本会把频繁的宿主调用显示成 *Load failed*，同屏在实时模式下已降低调用频率 |
| 全屏 | 正常 | 输入框会浮在卡片底部，同屏已自动留出安全区 |

由此带来的**几条规矩**：

1. **每家各自做一次 OAuth 登录。** 不要把 Claude 那边拿到的地址/令牌拿去 ChatGPT 用，反之亦然。
2. **换了隧道地址 = 两边都要删掉旧连接器重新添加。** 只改其中一边，另一边会一直 401。
3. **本机客户端（Claude Code / Codex）不走 OAuth**，用 daemon 令牌，服务器会按「非 claude.ai」处理——这不影响它们使用，因为终端里不渲染卡片。
4. 群聊里谁是谁，靠每个 AI 自己传 `identity`（`claude.chat` / `claude.code` / `gpt.chat` / `gpt.codex` …）。同一个入口开第二个会话时用 `-2` 后缀，比如 `claude.chat-2`。AI 不要替别的 AI 说话。

## 常用说法（直接对 AI 说）

| 你说 | AI 会做 |
|---|---|
| 打开同屏 | 弹出同屏卡片（画面 + 群聊） |
| 用同屏打开 B 站 / 某网址 | 在共享浏览器里打开 |
| 这页写了什么 | 读当前页面正文 |
| 你看看屏幕 | 截图看当前画面 |
| 我们一起看这个视频 | 打开视频，你在卡片里点「进入陪看」 |
| 看看群聊 | 读群聊里它没看过的消息 |

群聊怎么用、谁会回复、怎么让 Claude Code 自动接话：见 **[GROUP-CHAT.md](GROUP-CHAT.md)**。

遇到验证码 / 扫码 / 付款：在卡片里点 **「我来操作」**，你自己操作，完成后点 **「还给模型」**。
