# 升级同屏 TongPing 个人版

> 当前版本：`0.4.0-personal.2`。查看你正在运行的版本：`npm run doctor` 第一行，或 `http://127.0.0.1:45921/health` 里的 `version`。

**升级不会丢登录态。** 代码和数据是分开的：代码在同屏文件夹，登录态/令牌/聊天在 `TONGPING_HOME`（默认 `~/.tongping`）。只要不删 `TONGPING_HOME`、不改 `TONGPING_HOME` 的路径，升级后各网站仍是登录状态，Claude / ChatGPT 的连接器也不用重新添加。

## 方式一：下载 ZIP 的用户（推荐，可随时回退）

1. 在 `npm run up` 窗口按 `Ctrl+C` 停止同屏。
2. 下载新版本 ZIP，解压到一个**新文件夹**（例如 `C:\tongping-0.4.1`）。**旧文件夹先别删**，留着回退用。
3. 把旧文件夹里的 **`.env`** 复制到新文件夹。
4. 在新文件夹打开终端：
   ```bash
   npm ci
   ```
5. 阅读新版本 `CHANGELOG.md` 的「升级注意」，看有没有需要新增或修改的 `.env` 项（新版 `.env.example` 里会标出）。
6. 启动并检查：
   ```bash
   npm run up
   # 另开一个终端
   npm run doctor     # 第一行版本号应是新版本；没有 ❌
   npm run selftest   # 全部通过
   ```
7. 在 Claude / ChatGPT 里**新开一个对话**再「打开同屏」（旧对话里的卡片是旧版本页面，可能不兼容）。
8. 装过本地字幕的：在新文件夹运行一次 `npm run asr:install`（加上你当初用的 `--cn` / `--cpu`），更新字幕服务脚本。已下载的运行库和模型不会重新下载。
9. 确认没问题后，可以删掉旧文件夹。

**回退**：停止新版，回到旧文件夹运行 `npm run up` 即可（数据目录是同一个）。如果新版的 CHANGELOG 写了「数据格式有变更、不可回退」，回退前先备份 `TONGPING_HOME`。

## 方式二：git clone 的用户

```bash
# 停止同屏后
git pull
npm ci
npm run up
npm run doctor
```

本地改过代码导致 `git pull` 冲突：先 `git stash`，或者改用方式一。

## 升级后常见问题

| 现象 | 处理 |
|---|---|
| doctor 提示「正在运行的是 旧版本，代码是 新版本」 | 旧的同屏还在运行。找到旧窗口 `Ctrl+C`，再在新文件夹 `npm run up` |
| `npm ci` 报 lock 文件不一致 | 新文件夹里混进了旧文件。重新解压一份干净的 |
| 卡片报错 / 画面不出 | 新开对话重新「打开同屏」 |
| 端口被占用 | 旧版本没关干净，见 [TROUBLESHOOTING P1](TROUBLESHOOTING.md#p1-端口被占用) |

## 备份（可选，建议大版本升级前做）

停止同屏后，把整个 `TONGPING_HOME` 文件夹复制一份。里面有登录态和令牌，**备份文件同样不要发给任何人或上传网盘公开分享**。
