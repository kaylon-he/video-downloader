# 安全说明

本项目默认面向个人自部署使用。公网开放前必须补鉴权、速率限制、资源上限和清理策略。

## 输入校验

当前已实现：

- 只允许 `http` / `https`。
- 拒绝 `localhost`、回环地址、内网地址和保留地址，降低 SSRF 风险。
- 拒绝明显 shell 元字符。
- `yt-dlp` 调用统一使用 `spawn(cmd, args)` 参数数组，不拼接 shell 命令。
- 文件下载接口只接受 UUID 格式 `fileId`，避免路径穿越。

仍建议继续补：

- 允许域名白名单或黑名单。
- 单文件大小、时长、磁盘占用上限。
- 请求频率限制。

## cookies 和登录态

支持两种个人自用方式：

```bash
YTDLP_COOKIES_FROM_BROWSER=chrome
```

或：

```bash
YTDLP_COOKIES_ENABLED=true
YTDLP_COOKIES_PATH=/private/path/youtube.cookies.txt
```

安全要求：

- 不要提交真实 cookies 文件。
- 不要把 cookies 内容粘贴到前端、日志、Issue、PR 或聊天中。
- 不要把 cookies 文件打进 Docker 镜像。
- 不要在公网多用户服务中复用个人 cookies。
- `YTDLP_COOKIES_FROM_BROWSER` 和 `YTDLP_COOKIES_ENABLED=true` 不能同时启用。

`.gitignore` 已忽略：

- `.env*`
- `cookies.txt`
- `*.cookies.txt`

## 公网部署风险

如果直接暴露到公网，可能被当作下载代理滥用，带来：

- 带宽和磁盘成本。
- 版权和平台 ToS 风险。
- 服务被刷爆。
- 个人 cookies 泄露风险。

公网部署前至少补：

- 登录鉴权。
- IP / 用户级速率限制。
- 下载队列和并发限制。
- 最大文件大小和最大时长限制。
- 文件 TTL 清理。
- 基础审计日志，但不要记录敏感 URL 参数和 cookies。

## 合规边界

本项目仅用于个人学习、备份自有内容或有权下载的内容。下载、保存、传播受版权保护内容可能违反法律或平台服务条款。

## 报告安全问题

当前仓库是私有仓库。发现安全问题时，优先在私有渠道沟通，不要把 cookies、token、完整敏感 URL 或下载产物放到公开位置。
