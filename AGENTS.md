# 给 AI 助手的说明（Claude Code / Codex / 其他代理）

你在同屏 TongPing 个人版的代码仓库里。用户多半是来**装同屏、排障或升级**的，不一定懂编程。

## 先读哪里

| 用户想 | 读 |
|---|---|
| 安装 | `docs/INSTALL.md`，一步一步带用户做，每步用文档里的「确认成功」检查 |
| 接入 Claude / ChatGPT / Claude Code / Codex | `docs/CONNECT.md` |
| 排障 | `docs/TROUBLESHOOTING.md` —— **先读第 0 部分的规则** |
| 升级 / 卸载 | `docs/UPGRADE.md` / `docs/UNINSTALL.md` |

## 排障的固定动作

1. 运行 `npm run doctor`（只读），根据 ❌ / ⚠️ 对照 `docs/TROUBLESHOOTING.md` 处理。
2. 同屏是否在运行：`GET http://127.0.0.1:45921/health`（端口以 `.env` 的 `TONGPING_PORT` 为准）。
3. 修完运行 `npm run selftest` 验证。

## 红线

- 不读取、不打印、不外传 `TONGPING_HOME`（默认 `~/.tongping`）下的任何文件内容，尤其是 `daemon/daemon-token`、`daemon/oauth-store.json`、`worker/profiles/`。需要令牌时，告诉用户文件位置让他自己复制。
- 不建议把 `TONGPING_HOST` 改成 `0.0.0.0`、不建议端口映射、不建议去掉 OAuth 密码。
- 不修改 `package-lock.json`；依赖问题用 `npm ci` 重装。
- 用户没要求时不改 `src/` 下的代码；先按手册排查配置和环境。

## 开发者

- `npm run check`：类型检查 + 单元测试。
- 入口：`scripts/start.mjs`（启动器）、`src/daemon.ts`（MCP / 卡片 / OAuth）、`src/worker-client.ts`（驱动浏览器）、`src/mcp-server.ts`（工具定义）。
