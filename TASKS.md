# 视频下载工具 — 开发任务清单（TASKS）

> 技术栈：**单 Next.js 14 项目（App Router + TypeScript）+ 自部署（VPS/Docker）+ 服务端 yt-dlp / ffmpeg 真实下载**
> 架构决策：不拆独立 Node 服务；前端 + 下载后端同在一个 Next.js 工程；长任务用「启动任务 → 轮询进度」模式。
> 产物策略：下载文件存服务器 → 生成临时下载链接。
> 状态图例：⬜ 待开始 · 🟡 进行中 · ✅ 已完成

---

## 阶段 0：项目初始化与环境

| # | 任务 | 说明 | 涉及文件/模块 | 优先级 | 状态 |
|---|------|------|--------------|--------|------|
| 0.1 | 初始化 Next.js | create-next-app（TS + App Router + Tailwind）；内网源需指定存在的 Next 版本（如 14.x） | `package.json`、`next.config.mjs` | P0 | ✅ |
| 0.2 | 引入 UI | Tailwind CSS + shadcn/ui 或极简自写 | `src/app/globals.css` | P1 | ✅ |
| 0.3 | 代码规范 | ESLint + 路径别名 `@/*` | `.eslintrc.json`、`tsconfig.json` | P2 | ✅ |
| 0.4 | 环境变量约定 | 下载目录、最大并发、允许域名等 | `.env.example` | P1 | ✅ |
| 0.5 | 依赖安装脚本 | 跨平台装 yt-dlp + ffmpeg（mac/Linux） | `scripts/setup.sh` | P0 | ✅ |
| 0.6 | 命令行下载脚本 | 封装 yt-dlp 的核心下载逻辑，供后端复用，也可独立运行 | `scripts/download.sh` | P0 | ✅ |

## 阶段 1：解析能力（后端核心）

| # | 任务 | 说明 | 涉及文件/模块 | 优先级 | 状态 |
|---|------|------|--------------|--------|------|
| 1.1 | 封装 yt-dlp 调用 | spawn + 参数拼装 + 错误处理 | `lib/ytdlp.ts` | P0 | ✅ |
| 1.2 | 解析接口 | `POST /api/parse`：URL → 标题/封面/时长/清晰度列表（`yt-dlp -J`） | `app/api/parse/route.ts` | P0 | ✅ |
| 1.3 | 安全校验 | 协议白名单、防 SSRF、防命令注入 | `lib/validate.ts` | P0 | ✅ |
| 1.4 | generic 兜底 | yt-dlp 不认识的站，尝试解析页面里的 m3u8/mp4 | `lib/ytdlp.ts` | P1 | ⬜ |
| 1.5 | 统一返回结构 | 成功/失败/不支持 + 错误码 | `lib/types.ts` | P1 | ✅ |

## 阶段 2：下载与合并（后端核心）

| # | 任务 | 说明 | 涉及文件/模块 | 优先级 | 状态 |
|---|------|------|--------------|--------|------|
| 2.1 | 下载接口 | `POST /api/download`：URL + 格式 → 建任务 → 返回 `taskId` | `app/api/download/route.ts` | P0 | ✅ |
| 2.2 | 任务管理 | 内存版先行，预留 Redis 接口 | `lib/tasks.ts` | P0 | ✅ |
| 2.3 | 执行下载 | spawn yt-dlp（m3u8 自动下分片 + AES 解密） | `lib/ytdlp.ts` | P0 | ✅ |
| 2.4 | 合并转码 | ffmpeg 合并/转 mp4 | `lib/ytdlp.ts` | P0 | ✅ |
| 2.5 | 进度解析 | 解析 stdout 百分比/速度/ETA 写入任务 | `lib/tasks.ts` | P0 | ✅ |
| 2.6 | 进度接口 | `GET /api/progress?taskId=` 供前端轮询 | `app/api/progress/route.ts` | P0 | ✅ |
| 2.7 | 产物下载 | 存 `storage/` → 临时链接 `GET /api/file/:id` | `app/api/file/[id]/route.ts` | P0 | ✅ |
| 2.8 | 并发与队列 | 限制同时下载数，排队 | `lib/tasks.ts` | P1 | ✅ |
| 2.9 | 超时/取消/重试 | 任务异常处理 | `lib/tasks.ts` | P1 | ⬜ |

## 阶段 3：前端界面

| # | 任务 | 说明 | 涉及文件/模块 | 优先级 | 状态 |
|---|------|------|--------------|--------|------|
| 3.1 | 首页输入 | URL 输入框 + 「解析」按钮 | `app/page.tsx` | P0 | ✅ |
| 3.2 | 结果卡片 | 封面、标题、时长、清晰度下拉 | `components/ResultCard.tsx` | P0 | ✅ |
| 3.3 | 下载 + 进度条 | 触发任务 → 轮询进度 | `components/DownloadButton.tsx` | P0 | ✅ |
| 3.4 | 完成态 | 显示「保存文件」链接 | `components/DownloadButton.tsx` | P0 | ✅ |
| 3.5 | 任务列表/历史 | 多任务与下载历史 | `components/TaskList.tsx` | P2 | ⬜ |
| 3.6 | 交互态 | 错误/加载/空态提示 | 各组件 | P1 | ✅ |
| 3.7 | 响应式 | 移动端适配 | `globals.css` | P2 | ✅ |

## 阶段 4：健壮性与安全

| # | 任务 | 说明 | 涉及文件/模块 | 优先级 | 状态 |
|---|------|------|--------------|--------|------|
| 4.1 | 速率限制 | 防被当免费下载代理滥用 | `middleware.ts` | P1 | ⬜ |
| 4.2 | 磁盘清理 | 下载文件定时清除（TTL） | `lib/cleanup.ts` | P1 | ⬜ |
| 4.3 | 日志监控 | 成功率、失败原因聚合 | `lib/logger.ts` | P2 | ⬜ |
| 4.4 | 输入消毒 | 命令参数数组化，杜绝 shell 注入 | `lib/validate.ts` | P0 | ✅ |
| 4.5 | 资源上限 | 单文件大小、时长、总磁盘占用 | `lib/tasks.ts` | P1 | ⬜ |

## 阶段 5：部署与运维

| # | 任务 | 说明 | 涉及文件/模块 | 优先级 | 状态 |
|---|------|------|--------------|--------|------|
| 5.1 | Dockerfile | 镜像内置 yt-dlp + ffmpeg | `Dockerfile` | P0 | ⬜ |
| 5.2 | compose | 可选加 Redis | `docker-compose.yml` | P1 | ⬜ |
| 5.3 | standalone | Next.js `output: "standalone"` 精简镜像 | `next.config.mjs` | P1 | ✅ |
| 5.4 | 反向代理 | Nginx + 大文件下载超时 | `deploy/nginx.conf` | P1 | ⬜ |
| 5.5 | yt-dlp 更新 | 定期拉新版应对平台变动 | `scripts/setup.sh` | P2 | ⬜ |

## 阶段 6：可选增强

| # | 任务 | 说明 | 涉及文件/模块 | 优先级 | 状态 |
|---|------|------|--------------|--------|------|
| 6.1 | 浏览器抓包 | Playwright 监听 Network 抓 JS 动态 m3u8 | `lib/sniff.ts` | P3 | ⬜ |
| 6.2 | 仅音频 | 下载并转 mp3 | `lib/ytdlp.ts` | P3 | ⬜ |
| 6.3 | 字幕 | 字幕下载与内嵌 | `lib/ytdlp.ts` | P3 | ⬜ |
| 6.4 | 批量 | 播放列表 / 批量下载 | `lib/tasks.ts` | P3 | ⬜ |
| 6.5 | 登录态 | 个人自用 cookies.txt 支持，需显式环境变量开启 | `lib/ytdlp.ts`、`.env.example` | P3 | ✅ |

---

## 里程碑

| 里程碑 | 目标 | 包含任务 |
|--------|------|---------|
| **M1 · MVP** | 粘贴链接 → 选清晰度 → 下载 → 拿到 mp4 | 阶段 0 + 1.1/1.2 + 2.1~2.7 + 3.1~3.4 |
| **M2 · 可用版** | 稳定、防滥用、可部署 | 补 2.8/2.9 + 阶段 4 + 阶段 5 |
| **M3 · 增强版** | 抓包/音频/字幕/批量/登录态 | 阶段 6 按需 |

## 合规与风险提示

| 项 | 说明 |
|----|------|
| 版权 | 仅供个人学习/备份自有内容；下载并传播受版权内容有法律风险 |
| 滥用 | 公网部署可能被当免费下载代理，必须加鉴权/速率限制 |
| ToS | 各平台服务条款可能禁止下载，尊重 robots 与 ToS |
