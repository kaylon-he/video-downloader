# 部署指南

本项目需要在可执行长任务的服务器上运行，不适合 Vercel 这类 Serverless 环境。

## 运行要求

- Node.js 20+
- npm
- `yt-dlp`
- `ffmpeg`
- 可写下载目录，默认 `storage/`

检查依赖：

```bash
bash scripts/setup.sh --check
```

安装 Node 依赖：

```bash
npm install
```

构建：

```bash
npm run build
```

启动：

```bash
npm run start
```

## 环境变量

建议使用 `.env.local` 或进程管理器环境变量。

```bash
DOWNLOAD_DIR=/data/video-downloader/storage
MAX_CONCURRENT_PARSE=2
MAX_CONCURRENT_DOWNLOADS=1
YTDLP_COOKIES_FROM_BROWSER=
YTDLP_COOKIES_ENABLED=false
YTDLP_COOKIES_PATH=
```

说明：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DOWNLOAD_DIR` | `storage` | 下载产物目录 |
| `MAX_CONCURRENT_PARSE` | `2` | 同时解析任务数，YouTube / X 等平台不建议调太大 |
| `MAX_CONCURRENT_DOWNLOADS` | `1` | 同时下载任务数 |
| `YTDLP_COOKIES_FROM_BROWSER` | 空 | 读取本机浏览器 cookies，如 `chrome` |
| `YTDLP_COOKIES_ENABLED` | `false` | 是否启用 cookies 文件模式 |
| `YTDLP_COOKIES_PATH` | 空 | Netscape 格式 cookies 文件路径 |

`YTDLP_COOKIES_FROM_BROWSER` 和 `YTDLP_COOKIES_ENABLED=true` 不要同时使用。

## 本地开发

普通模式：

```bash
npm run dev
```

读取本机 Chrome 登录态：

```bash
npm run dev:chrome
```

## 生产启动示例

使用 `pm2`：

```bash
npm install -g pm2
npm run build
DOWNLOAD_DIR=/data/video-downloader/storage pm2 start npm --name video-downloader -- run start
```

查看日志：

```bash
pm2 logs video-downloader
```

## Nginx 反向代理

示例：

```nginx
server {
  listen 80;
  server_name example.com;

  client_max_body_size 10m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

大文件下载可能需要更长的 `proxy_read_timeout`。

## Docker 状态

当前仓库还没有提交 `Dockerfile` 和 `docker-compose.yml`。如果要部署到 Docker，建议下一步补：

- 镜像内安装 `yt-dlp` 和 `ffmpeg`
- 挂载 `storage/`
- 通过环境变量配置下载目录和 cookies
- 反向代理处理大文件下载超时

## 生产注意事项

- 公网部署前必须增加鉴权和速率限制。
- 不要把 cookies 文件放进镜像或仓库。
- `storage/` 需要定期清理，避免磁盘打满。
- 当前任务队列是单进程内存版，服务重启会丢失任务状态。
