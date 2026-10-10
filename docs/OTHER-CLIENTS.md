# 接其他 AI（Kimi、自建前端等）：思路参考

> **同屏个人版是为官方 Claude（claude.ai / Claude App / Claude Code）和官方 ChatGPT（ChatGPT / Codex）做的，也只在它们上面测试过。**
> 这一页只是给想折腾的人提供思路：别的客户端**能不能用、能用到什么程度，取决于它支持多少 MCP 功能**，出了问题请先确认是不是客户端本身不支持。

---

## 同屏对外提供的三层东西

| 层 | 是什么 | 需要客户端支持 | 不支持时 |
|---|---|---|---|
| ① 工具 | 50 个 MCP 工具：打开网页、读、点、输入、截图、读视频进度和字幕、发/读群聊… | **MCP Streamable HTTP**（远程 MCP），认证用 Bearer 令牌或 OAuth 2.1 | 用 stdio 方式（见下文），功能打折 |
| ② 卡片 | 带实时画面、群聊、陪看、摄像头的交互界面（MCP Apps，`ui://` 资源） | **MCP Apps**（Claude、ChatGPT 已支持；大多数第三方客户端还不支持） | 看不到卡片；用 `/live` 网页看画面、接管 |
| ③ 群聊 | 你和多个 AI 的共享房间 | 只要有 ① 就能**发言和读消息** | 你这一侧只能在卡片里说话；没有卡片时可以去 Claude/ChatGPT 的卡片里说 |

所以：**只要一个客户端能接远程 MCP 并且模型会调工具，它就能逛网页、看截图、读字幕、在群里说话。**卡片是加分项，不是必需品。

## 接入方式

### A. 客户端支持远程 MCP + 自定义请求头（最常见）

- 地址：`http://127.0.0.1:45921/mcp`（客户端和同屏在同一台电脑上时）
- 请求头：`Authorization: Bearer <TONGPING_HOME/daemon/daemon-token 里的令牌>`
- 传输：Streamable HTTP（不是旧的 SSE）

很多桌面客户端（各类「AI 工作台」、IDE 插件）都是这种配置方式，填法和 [CONNECT.md](CONNECT.md) 里 Claude Code / Codex 的一样。

### B. 客户端在云上（网页版 AI 平台）

和 claude.ai / ChatGPT 一样：需要 [INSTALL.md 第 6 步](INSTALL.md#6可选开-https-隧道给-claudeai--chatgpt-网页版用)的 HTTPS 隧道，连接器地址填 `https://你的隧道地址/mcp`。

- 平台支持 **OAuth（动态客户端注册 + PKCE）**：会弹出同屏授权页，输密码即可。
- 平台只支持「填一个固定令牌」：可以把 daemon 令牌填进去，但这等于把浏览器的完全控制权交给那个平台，**强烈不建议**，除非你完全信任它。

### C. 客户端只支持 stdio（本地命令）

```json
{
  "command": "npm",
  "args": ["run", "mcp", "--prefix", "/同屏的完整路径"],
  "env": {
    "TONGPING_DAEMON_URL": "http://127.0.0.1:45921",
    "TONGPING_HOME": "/你的用户目录/.tongping/daemon",
    "TONGPING_CLIENT_NAME": "kimi"
  }
}
```

限制：stdio 进程里的群聊和 daemon 的群聊**不是同一个房间**，在这种模式下发的群消息别人看不到。只适合「让 AI 逛网页」。

## 接进来以后要告诉模型的事

同屏连接时会给模型一段规则（身份、群聊礼仪、先看屏幕再说话）。有些客户端不会把 MCP 服务器的说明传给模型，这时你可以把下面这段放进系统提示词：

```
你接入了「同屏」共享浏览器。
- 你的群聊身份是 kimi.chat（自己起一个 名字.入口，只能小写字母数字和 . _ -），每次调用 browser_app_chat_push / browser_app_room_read 都传这个 identity。
- 不要替别的 AI 说话；只回答用户，被点名时才回别的 AI，不要和别的 AI 来回接龙。
- 用户说的事和屏幕有关时，先调用 browser_screenshot 看一眼再回答。
- 遇到验证码、登录、付款，请用户在卡片或 /live 页面点「我来操作」，不要自己尝试。
- 工具报 site_risk_* 时停止操作并告诉用户，不要重试。
```

## 已知差异与坑

| 现象 | 原因 / 处理 |
|---|---|
| 工具太多被截断、或模型乱调用 | 同屏有 50 个工具。有的客户端对工具数量有上限，或者模型调工具能力弱。可以在客户端里只启用常用的：`browser_open`、`browser_read`、`browser_snapshot`、`browser_click`、`browser_type`、`browser_screenshot`、`browser_media_context`、`browser_app_chat_push`、`browser_app_room_read` |
| 卡片不显示 | 客户端不支持 MCP Apps。用浏览器打开 `http://127.0.0.1:45921/live`，输入 daemon 令牌，可以看实时画面、接管操作 |
| 群里显示成 `gpt.chat` | 模型没传 `identity`，服务器用了默认值。按上面的提示词让它每次都传 |
| OAuth 授权后卡片元数据带 `openai/*` 键 | 同屏只把 claude.ai 识别为 Claude 宿主，其他所有客户端按 ChatGPT 规则处理。一般不影响工具使用 |
| 截图很大、超出上下文 | 让模型优先用 `browser_read` / `browser_snapshot`（文字），必要时再截图 |

## 想自己做前端（自己渲染卡片）

卡片是一个标准的 MCP Apps 页面（资源 `ui://` 开头，见 `src/browser-app.ts`），通过 `@modelcontextprotocol/ext-apps` 的宿主桥接和对话通信：
- 卡片会调用 `sendMessage` 把你在群聊框里说的话发进对话，并要求模型用 `browser_app_chat_push` 回复；
- 用 `updateModelContext` 告诉模型当前在看什么；
- 实时画面、声音、陪看走卡片里的 WebSocket / HLS 地址（由 `browser_app` 工具结果里的带签名链接提供）。

自建前端实现这套宿主协议就能嵌入卡片；最省事的替代方案是只用工具 + `/live` 页面。这部分属于高级玩法，本项目不提供支持。
