# Video Downloader

一个自部署视频下载工具。粘贴视频链接后，服务端通过 `yt-dlp` 解析视频信息，通过 `yt-dlp` / `ffmpeg` 下载、合并，并在网页里提供任务管理、在线播放和文件下载。

适合个人学习、备份自有内容和内网自用。请遵守目标平台服务条款与版权要求。

## 功能

- 单链接或多行链接创建解析任务
- 统一任务中心：解析中、已解析、排队中、下载中、已完成、失败状态统一展示
- 支持选择清晰度 / 格式后加入下载队列
- 下载完成后支持：
  - 在线播放
  - 下载文件
  - 删除任务和本地文件
- 历史任务持久化到 `storage/history.json`
- 启动时自动扫描 `storage/` 下已有视频，恢复到任务列表
- 自动读取本地视频时长和缩略图
- 支持 Chrome cookies 个人自用模式，用于 YouTube / X 等需要登录态的平台
- 通过并发配置限制解析和下载，避免机器资源被打满

## 技术栈

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- yt-dlp
- ffmpeg / ffprobe

## 目录说明

```text
src/app/page.tsx                 # 任务中心页面
src/app/api/tasks/*              # 任务式 API
src/app/api/stream/[id]/route.ts # 在线播放流接口
src/app/api/file/[id]/route.ts   # 文件下载接口
src/lib/ytdlp.ts                 # yt-dlp 封装
src/lib/tasks.ts                 # 下载任务队列
src/lib/parse-tasks.ts           # 解析任务队列
src/lib/history.ts               # 任务记录和本地文件恢复
scripts/setup.sh                 # 安装 / 检查 yt-dlp 与 ffmpeg
scripts/download.sh              # 命令行下载脚本
storage/                         # 下载产物和任务记录，默认不提交
```

## 环境要求

- Node.js 20+
- npm
- yt-dlp
- ffmpeg / ffprobe

macOS / Linux 可以用脚本检查依赖：

```bash
bash scripts/setup.sh --check
```

如果缺少依赖，可以运行：

```bash
bash scripts/setup.sh
```

## 本地启动

安装依赖：

```bash
npm install
```

普通启动：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

如果端口 `3000` 被占用，Next.js 会自动切换到其他端口，按终端输出为准。

## 使用 Chrome 登录态启动

YouTube / X 有时会要求登录态或触发风控。个人自用时，如果你的本机 Chrome 已登录对应网站，可以这样启动：

```bash
npm run dev:chrome
```

这个命令等价于：

```bash
YTDLP_COOKIES_FROM_BROWSER=chrome next dev
```

注意：这只适合本机个人使用，不建议公网多用户服务读取浏览器 cookies。

## 环境变量

可以复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

常用配置：

```bash
# 下载产物目录
DOWNLOAD_DIR=storage

# 同时解析任务数
MAX_CONCURRENT_PARSE=2

# 同时下载任务数
MAX_CONCURRENT_DOWNLOADS=1

# cookies.txt 模式
YTDLP_COOKIES_ENABLED=false
YTDLP_COOKIES_PATH=/absolute/path/to/cookies.txt

# 浏览器 cookies 模式，例如 chrome
YTDLP_COOKIES_FROM_BROWSER=
```

`YTDLP_COOKIES_ENABLED=true` 和 `YTDLP_COOKIES_FROM_BROWSER=chrome` 不要同时开启。

## cookies.txt 模式

如果不想读取 Chrome，也可以导出 Netscape 格式 `cookies.txt`：

```bash
YTDLP_COOKIES_ENABLED=true
YTDLP_COOKIES_PATH=/Users/you/private/youtube.cookies.txt
```

安全约定：

- 不要提交真实 cookies 文件
- 不要把 cookies 内容贴到日志、Issue 或前端页面
- 不要把个人 cookies 用在公开服务里

## 命令行下载

除了网页，也可以直接使用脚本：

```bash
bash scripts/download.sh "https://example.com/video"
```

读取 Chrome cookies：

```bash
YTDLP_COOKIES_FROM_BROWSER=chrome \
bash scripts/download.sh "https://www.youtube.com/watch?v=..."
```

## 常用脚本

```bash
npm run dev         # 普通本地开发
npm run dev:chrome  # 读取 Chrome cookies 的本地开发
npm run lint        # ESLint
npm run build       # 生产构建检查
```

## API

主要接口：

- `POST /api/tasks/parse`：创建解析任务，支持多行 URL
- `GET /api/tasks`：读取任务列表
- `POST /api/tasks/[id]/download`：从已解析任务创建下载任务
- `DELETE /api/tasks/[id]`：删除任务，完成任务会同步删除本地文件
- `GET /api/stream/[id]`：在线播放，支持 `Range`
- `GET /api/file/[id]`：下载文件

完整说明见 [API.md](API.md)。

## 部署提醒

本项目需要在服务端执行 `yt-dlp` 和 `ffmpeg`，不适合部署到普通 Serverless 环境。推荐 VPS / Docker / 内网机器自部署。

公网部署前至少补齐：

- 鉴权
- 速率限制
- 下载大小 / 时长 / 磁盘占用上限
- 定时清理
- 明确合规边界

部署细节见 [DEPLOY.md](DEPLOY.md)，安全边界见 [SECURITY.md](SECURITY.md)。

## 排障

常见问题：

- YouTube 报 `Sign in to confirm you’re not a bot`
- X / Twitter 解析失败
- Chrome cookies 读取失败
- `yt-dlp` 版本过旧
- `ffmpeg` 或 `ffprobe` 不存在
- 任务下载中断
- 端口被占用

见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。

## 文档

- [API.md](API.md)：接口、响应结构和错误码
- [DEPLOY.md](DEPLOY.md)：VPS / 生产启动 / Nginx 部署说明
- [SECURITY.md](SECURITY.md)：cookies、SSRF、公网部署和合规边界
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)：常见问题排障
- [TASKS.md](TASKS.md)：开发任务清单
- [TEST_PLAN.md](TEST_PLAN.md)：测试计划

## 合规声明

本项目仅供个人学习和备份自有内容使用。下载、保存或传播受版权保护内容可能产生法律风险。请尊重目标平台服务条款、版权和 robots 规则。
