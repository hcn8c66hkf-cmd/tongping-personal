# 同屏 TongPing · 个人版

**让你的 AI 和你看同一块屏幕。** 同屏在你自己的电脑上开一个真实的 Chrome，通过 MCP 交给 Claude、ChatGPT、Claude Code、Codex 使用：

- **逛网页**：AI 能打开、阅读、点击、输入、滚动；登录态保存在你电脑上的浏览器 profile 里。
- **看视频**：卡片里实时显示画面；「陪看」模式延迟缓冲播放，AI 只看得到你已经看过的部分（不剧透）。没有字幕的视频，可选装本地语音识别，AI 也能「听」到台词。
- **聊天**：卡片内置群聊，你和多个 AI（比如 Claude 和 ChatGPT）在同一个房间里说话。
- **人工接管**：遇到验证码、扫码登录、付款，点一下「我来操作」由你亲手操作，这期间 AI 不能动手；操作完点「还给模型」。

个人版 = **一台电脑、一个人用**。所有数据都留在你的电脑上，没有任何第三方服务器。

**主要为官方 Claude（claude.ai / Claude App / Claude Code）和官方 ChatGPT（ChatGPT / Codex）设计和测试。** 想接 Kimi、自建前端或其他 AI，可以参考 [OTHER-CLIENTS.md](docs/OTHER-CLIENTS.md) 的思路，但不保证效果。

| | |
|---|---|
| 版本 | `0.4.0-personal.2`（见 [CHANGELOG](CHANGELOG.md)） |
| 系统 | Windows 11（已从零实测）、Linux（Ubuntu 24.04 已从零实测）、Windows 10 / macOS（理论支持，未实测） |
| 需要 | Node.js 20+、Chrome 或 Edge（或 Playwright Chromium）、ffmpeg（陪看用）；可选 Python 3.9–3.14（本地字幕） |

## 30 秒看懂架构

```
 claude.ai / ChatGPT ──HTTPS 隧道──┐
 Claude Code / Codex ──本机──────┐ │
                                 ▼ ▼
                     ┌──────── daemon（端口 45921）────────┐
                     │ MCP 服务 · 卡片 · 群聊 · OAuth 登录  │
                     └───────────────┬──────────────────────┘
                                     │ 本机 127.0.0.1
                     ┌───────────────▼──────────────────────┐
                     │ worker：驱动真实 Chrome、录制画面声音  │
                     └──────────────────────────────────────┘
```

`npm run up` 一条命令同时启动 daemon 和 worker。

## 快速开始

完整图文步骤见 **[docs/INSTALL.md](docs/INSTALL.md)**。熟悉命令行的话：

```bash
# 1. 准备：Node.js 20+、Chrome、ffmpeg
# 2. 安装
npm ci
cp .env.example .env          # Windows: copy .env.example .env
# 3. 启动（窗口保持打开）
npm run up
# 4. 另开一个终端自检：逛网页 / 看视频 / 聊天 全部打勾即可
npm run selftest
```

然后按 [docs/CONNECT.md](docs/CONNECT.md) 把同屏接到你的 AI 上。

## 文档

| 文档 | 内容 |
|---|---|
| [INSTALL.md](docs/INSTALL.md) | 安装（Windows / macOS / Linux），每一步怎么确认成功 |
| [CONNECT.md](docs/CONNECT.md) | 接入 claude.ai、ChatGPT、Claude Code、Codex，以及 **Claude 和 ChatGPT 的差异** |
| [OTHER-CLIENTS.md](docs/OTHER-CLIENTS.md) | 接 Kimi、自建前端等其他 AI 的思路（非官方支持） |
| [GROUP-CHAT.md](docs/GROUP-CHAT.md) | **群聊怎么用**：谁会回复、按钮作用、身份名、让 Claude Code 挂在群里自动接话 |
| [UPGRADE.md](docs/UPGRADE.md) | 升级到新版本，保留登录态 |
| [UNINSTALL.md](docs/UNINSTALL.md) | 彻底卸载，清理数据 |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | **AI 排障手册** + 常见问题。出问题时把它和 `npm run doctor` 的输出一起交给 AI |
| [SECURITY.md](docs/SECURITY.md) | 安全边界：哪些事 AI 做不了，你的数据在哪 |

## 出问题了？

```bash
npm run doctor
```

它会逐项检查并输出一段**已打码**的「诊断摘要」。把摘要和 `docs/TROUBLESHOOTING.md` 一起发给你的 AI（Claude、ChatGPT 都行），让它照着手册排查。

## 命令一览

| 命令 | 作用 |
|---|---|
| `npm run up` | 启动同屏（daemon + worker），Ctrl+C 停止 |
| `npm run selftest` | 端到端自检：网页、视频、实时画面、群聊 |
| `npm run doctor` | 体检 + 诊断摘要（只读，不改任何东西） |
| `npm run asr:install` | 安装本地字幕（语音识别）。国内网络加 `-- --cn` |
| `npm run room:watch -- --me claude.code` | 让本机 AI 监听群聊（见 GROUP-CHAT.md） |
| `npm run check` | 类型检查 + 单元测试（开发者用） |

## 使用须知

- 同屏操作的是**你自己的**浏览器和账号。请遵守各网站的用户协议；频繁自动化操作可能触发网站风控，后果由使用者自行承担。
- 默认只监听本机 `127.0.0.1`。不要把端口直接暴露到公网；要给网页版 AI 用，请走 HTTPS 隧道并设置授权密码（见 CONNECT.md）。
- `TONGPING_HOME`（默认 `~/.tongping`）里有你的登录态和令牌，**不要上传、不要发给任何人**，包括排障时。

## 许可

[PolyForm Noncommercial 1.0.0](LICENSE)：**不许商用**。

- 可以：个人自用、学习、研究、爱好项目，学校、公益和非营利组织使用，修改后自己用或按同样条款分享。
- 不可以：任何商业用途，包括卖它、拿它收费提供服务、放进商业产品或公司业务里用。
- 转发或分享时要附上这份许可证和开头的 `Required Notice` 那一行。

需要商用授权请先联系作者。
