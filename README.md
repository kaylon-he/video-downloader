# Video Downloader

自部署视频下载工具：粘贴视频链接，服务端通过 `yt-dlp` / `ffmpeg` 解析、下载、合并，并提供临时文件下载链接。

下载产物保存在 `storage/`，历史记录保存在 `storage/history.json`。历史页会扫描 `storage/` 中已有视频，自动补齐时长和本地缩略图，并提供下载入口。

## 快速开始

```bash
bash scripts/setup.sh --check
npm install
npm run dev
```

打开 `http://localhost:3000`。

如果要测试 YouTube 并读取本机 Chrome 登录态：

```bash
npm run dev:chrome
```

## 环境变量

复制 `.env.example` 为 `.env.local` 后按需调整：

```bash
DOWNLOAD_DIR=storage
MAX_CONCURRENT_DOWNLOADS=1
YTDLP_COOKIES_ENABLED=false
YTDLP_COOKIES_PATH=/absolute/path/to/cookies.txt
YTDLP_COOKIES_FROM_BROWSER=
```

## YouTube cookies 个人自用模式

当 YouTube 返回 `Sign in to confirm you’re not a bot` 时，可以为个人自用读取本机浏览器登录态。

### 方式一：直接读取 Chrome

如果本机 Chrome 已登录 YouTube：

```bash
npm run dev:chrome
```

该命令等价于 `YTDLP_COOKIES_FROM_BROWSER=chrome npm run dev`。

命令行脚本也支持：

```bash
YTDLP_COOKIES_FROM_BROWSER=chrome \
bash scripts/download.sh "https://www.youtube.com/watch?v=..."
```

### 方式二：导出 cookies.txt

也可以配置本地 `cookies.txt`：

1. 从自己的浏览器导出 Netscape 格式 cookies 文件。
2. 将文件保存到项目外或本机私有目录，例如 `/Users/you/private/youtube.cookies.txt`。
3. 在 `.env.local` 中开启：

```bash
YTDLP_COOKIES_ENABLED=true
YTDLP_COOKIES_PATH=/Users/you/private/youtube.cookies.txt
```

4. 重启 `npm run dev`。

安全约定：

- 不要把真实 cookies 文件放进仓库。
- 不要把 cookies 内容贴到前端或日志里。
- 该模式只适合个人自用，不适合公网多用户服务。

命令行脚本也支持同样的 cookies 文件环境变量：

```bash
YTDLP_COOKIES_ENABLED=true \
YTDLP_COOKIES_PATH=/Users/you/private/youtube.cookies.txt \
bash scripts/download.sh "https://www.youtube.com/watch?v=..."
```

## 验证

```bash
npm run lint
npm run build
```

## 文档

- [API.md](API.md)：接口、响应结构和错误码。
- [DEPLOY.md](DEPLOY.md)：VPS / 生产启动 / Nginx 部署说明。
- [SECURITY.md](SECURITY.md)：cookies、SSRF、公网部署和合规边界。
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)：YouTube、X、依赖、端口和下载失败排障。
- [TASKS.md](TASKS.md)：开发任务清单。
- [TEST_PLAN.md](TEST_PLAN.md)：测试计划。
