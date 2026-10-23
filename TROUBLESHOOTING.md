# 排障指南

## 依赖检查

先确认外部二进制存在：

```bash
bash scripts/setup.sh --check
```

正常应看到：

- `yt-dlp` 已安装
- `ffmpeg` 已安装

## YouTube: Sign in to confirm you’re not a bot

现象：

```text
Sign in to confirm you’re not a bot
```

原因：YouTube 对当前 IP / 自动化请求触发风控，需要登录态。

本机自用优先使用：

```bash
npm run dev:chrome
```

等价于：

```bash
YTDLP_COOKIES_FROM_BROWSER=chrome next dev
```

如果仍失败，直接测试 `yt-dlp`：

```bash
yt-dlp --cookies-from-browser chrome -J --no-playlist "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```

如果该命令也失败，说明问题在 `yt-dlp` / Chrome 登录态 / YouTube 风控，不在项目 API。

## Chrome cookies 读取失败

可能原因：

- Chrome 没有登录目标平台。
- Chrome cookies 被系统加密，当前终端无权限读取。
- 浏览器配置不是默认 profile。
- 平台 cookies 已过期。

可改用 cookies 文件模式：

```bash
YTDLP_COOKIES_ENABLED=true
YTDLP_COOKIES_PATH=/Users/you/private/youtube.cookies.txt
npm run dev
```

注意不要同时设置 `YTDLP_COOKIES_FROM_BROWSER`。

## X / Twitter 视频失败

先确认 `yt-dlp` 支持 extractor：

```bash
yt-dlp --list-extractors | rg -i '^(twitter|x)'
```

公开视频通常可直接解析。私密账号、登录后可见、年龄限制或地区限制内容可能需要：

```bash
npm run dev:chrome
```

如果仍失败，先用命令行验证：

```bash
yt-dlp --cookies-from-browser chrome -J --no-playlist "https://x.com/.../status/..."
```

## yt-dlp 版本过旧

平台经常改接口，`yt-dlp` 需要保持较新版本。

macOS：

```bash
brew upgrade yt-dlp
```

Linux 官方二进制：

```bash
sudo yt-dlp -U
```

然后重试解析。

## ffmpeg 不存在或合并失败

现象：

- 下载完成但没有 mp4。
- 报错提到 `ffmpeg`。
- 音视频分离格式无法合并。

处理：

```bash
bash scripts/setup.sh --check
```

macOS：

```bash
brew install ffmpeg
```

## 端口 3000 被占用

`next dev` 会自动尝试 3001。也可以指定端口：

```bash
npm run dev -- -p 3002
```

或查占用：

```bash
lsof -i :3000
```

## /api/progress 返回 TASK_NOT_FOUND

当前任务存储是单进程内存版：

- 服务重启会丢失任务。
- 多进程 / 多实例部署时不同实例之间不共享任务。

生产部署如果需要多实例，应改为 Redis 或数据库队列。

## 下载文件 404

可能原因：

- 任务还没完成。
- 服务重启导致内存任务丢失。
- 文件被手动删除或后续 TTL 清理删除。
- `fileId` 格式不正确。

先查任务：

```bash
curl "http://localhost:3000/api/progress?taskId=..."
```

## 普通 MP4 能下载，平台视频失败

这通常说明项目链路没问题，失败在平台解析或风控。

验证普通 MP4：

```bash
bash scripts/download.sh "https://download.samplelib.com/mp4/sample-5s.mp4"
```

如果普通 MP4 成功，继续排查：

- 平台是否需要登录态。
- `yt-dlp` 是否过旧。
- 该视频是否私密、删除、地区限制或年龄限制。
