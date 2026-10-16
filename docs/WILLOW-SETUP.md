# 小安的同屏安装清单

这份清单只记录我们的安装顺序和安全边界，不保存密码、令牌、Cookie 或浏览器登录态。

## 已完成

- [x] 将上游 `lizhima44-max/tongping-personal` fork 到 `hcn8c66hkf-cmd/tongping-personal`
- [x] 保留 `main` 作为上游同步分支
- [x] 创建 `willow-setup` 作为我们的准备与定制分支
- [x] 云端完成 `npm ci` 与 TypeScript 类型检查
- [x] 云端单元测试通过 490 / 495；剩余 5 项依赖真实 Chromium，留给 GitHub Actions 或本机复核

## 电脑打开后

1. 确认系统版本，以及 Node.js 20+、Chrome、ffmpeg 是否已经安装。
2. 从我们的 fork 下载 `willow-setup` 分支，放在纯英文路径，例如 `C:\tongping`。
3. 双击 `启动同屏.cmd`，或运行 `npm ci`、复制 `.env.example` 为 `.env`、再运行 `npm run up`。
4. 运行 `npm run selftest`；网页、视频、实时画面、群聊全部打勾后再继续。
5. 配置固定 HTTPS 隧道，再接入 ChatGPT。临时隧道只用于短时测试。
6. 最后再决定是否安装本地字幕；它不是基础功能的前置条件。

## 准备写入本机 .env 的非敏感项

```ini
TONGPING_CHANNEL=chrome
TONGPING_LOCALE=zh-CN
TONGPING_TIMEZONE=Asia/Shanghai
```

公网地址与 OAuth 密码等到固定隧道建立后只写进本机 `.env`，不提交 GitHub。

## 我们的安全边界

- 不读取、不上传 `~/.tongping` 内的令牌、OAuth 记录和浏览器 profile。
- 同屏浏览器只登录确实需要操作的网站；不登录网银和主力邮箱。
- 不把 `TONGPING_HOST` 改为 `0.0.0.0`，不做路由器端口映射。
- 付款、下单、验证码、密码输入始终由小安本人接管。
- 排障先运行 `npm run doctor`，修复后再运行 `npm run selftest`。
