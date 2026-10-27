# AGENTS.md — 视频下载工具开发指南

> 本文件供参与本项目的 AI 助手与开发者阅读，约定技术方案、代码规范、协作方式与红线。
> 配套文档：开发任务见 `TASKS.md`，测试计划见 `TEST_PLAN.md`。

---

## 1. 项目概述

| 项 | 内容 |
|----|------|
| 目标 | 粘贴视频链接 → 解析 → 服务端用 yt-dlp/ffmpeg 下载合并 → 提供文件下载 |
| 形态 | 单一 Next.js 14 项目（App Router + TypeScript），前端 + 下载后端同仓 |
| 部署 | **自部署（VPS / Docker）**，不部署 Vercel（Serverless 跑不了 yt-dlp/ffmpeg） |
| 下载引擎 | yt-dlp（解析+下载）+ ffmpeg（合并/转码） |
| 产物策略 | 下载文件存服务器 `storage/` → 生成临时下载链接 |
| 长任务模型 | 启动任务返回 `taskId` → 前端轮询 `/api/progress` |

## 2. 技术栈与版本约定

| 技术 | 约定 | 备注 |
|------|------|------|
| Next.js | 14.x（App Router） | **内网 npm 源（bnpm）没有最新版**，初始化时须显式指定存在的版本，勿用 `@latest` |
| TypeScript | strict 模式 | 禁用隐式 any |
| 包管理 | npm | 锁定 `package-lock.json` |
| 测试 | Jest（后端）+ Playwright（E2E） | 见 `TEST_PLAN.md` |
| 样式 | Tailwind CSS | 组件可选 shadcn/ui |
| 外部二进制 | yt-dlp + ffmpeg | 通过 `scripts/setup.sh` 安装，mac/Linux 均支持 |

## 3. 目录结构约定

```
video-downloader/
├─ src/app/
│  ├─ page.tsx                   # 首页
│  └─ api/
│     ├─ parse/route.ts          # 解析
│     ├─ download/route.ts       # 发起下载
│     ├─ progress/route.ts       # 进度轮询
│     └─ file/[id]/route.ts      # 产物下载
├─ src/lib/
│  ├─ ytdlp.ts                   # yt-dlp/ffmpeg 封装（唯一调用外部命令处）
│  ├─ tasks.ts                   # 任务状态机 + 队列
│  ├─ validate.ts                # URL 校验 / 输入消毒
│  └─ types.ts                   # 统一类型与返回结构
├─ scripts/
│  ├─ setup.sh                   # 跨平台装 yt-dlp + ffmpeg
│  └─ download.sh                # 命令行下载（后端复用的核心引擎）
├─ storage/                      # 下载产物（gitignore）
├─ __tests__/                    # Jest
├─ e2e/                          # Playwright
├─ TASKS.md · TEST_PLAN.md · AGENTS.md
```

## 4. 安全红线（必须遵守）

| # | 红线 | 做法 |
|---|------|------|
| 4.1 | **禁止 shell 注入** | 一律用 `spawn(cmd, [args])` 数组传参，**绝不**用字符串拼接 `exec` |
| 4.2 | **URL 校验** | 只允许 http/https；拒绝内网/回环地址（防 SSRF）；拒绝含 shell 元字符 |
| 4.3 | **防滥用** | 公网必加速率限制 + 资源上限（文件大小/时长/磁盘） |
| 4.4 | **不碰凭据** | 不在代码/日志中写入任何平台 Cookie、token；登录态功能延后且需显式开关 |
| 4.5 | **磁盘清理** | 产物设 TTL 定时清除，避免撑爆磁盘 |
| 4.6 | **路径安全** | `file/[id]` 校验 id，禁止路径穿越（`../`） |

## 5. 编码规范

| 项 | 约定 |
|----|------|
| 外部命令封装 | 所有 yt-dlp/ffmpeg 调用集中在 `lib/ytdlp.ts`，其他地方不得直接 spawn |
| 错误处理 | API 返回统一结构 `{ ok, data?, error? }` + 明确错误码，不抛裸异常给前端 |
| 类型 | 公共类型放 `lib/types.ts`，前后端共享 |
| 命名 | 文件 kebab-case，变量/函数 camelCase，类型 PascalCase |
| 注释 | 中文注释，解释“为什么”而非“做什么”；复杂正则/解析必须注释样例 |
| 日志 | 结构化日志，脱敏（不打印完整 URL 的敏感参数） |
| 提交信息 | 中文，首行概括改动与目的 |

## 6. 测试规范

| 项 | 约定 |
|----|------|
| 单元测试 | **mock `child_process`**，不真跑 yt-dlp；覆盖参数拼装、解析、校验、状态机 |
| 真实网络 | 打 `@network` 标记，CI 可跳过（平台抽风不应导致 CI 红） |
| 新功能 | 伴随测试提交；`lib/` 行覆盖目标 ≥ 80% |
| E2E | 覆盖 M1 主流程（解析→下载→完成） |
| 提交前 | 本地跑 `npm run test:unit` 通过 |

## 7. 协作与流程约定

| 项 | 约定 |
|----|------|
| 需求对齐 | 架构级决策（部署方式/是否碰登录态等）**先确认再动手**，不擅自扩大范围 |
| 任务跟踪 | 完成一项即更新 `TASKS.md` 对应状态（⬜→🟡→✅） |
| 文档同步 | 改动涉及接口/结构时同步更新本文件与 TASKS/TEST_PLAN |
| 破坏性操作 | 删除/重置/覆盖文件前先确认；脚手架初始化注意已存在文件 |
| 环境差异 | 脚本与部署须同时兼容 **macOS 与 Linux** |

## 8. 合规提示

| 项 | 说明 |
|----|------|
| 用途 | 仅供个人学习 / 备份自有内容 |
| 版权 | 下载并传播受版权保护内容存在法律风险 |
| ToS | 尊重各平台服务条款与 robots；不绕过平台付费墙 |
| 部署 | 公网提供服务前自行评估合规与滥用风险 |

---

## 9. 快速开始（开发者）

任务删除支持所有状态：先停止解析/下载进程并移除排队任务，等待退出后删除记录、视频、分片及缩略图；取消后的回调禁止恢复记录。任务取消信号通过 `lib/ytdlp.ts` 传递至 yt-dlp/ffmpeg 及浏览器解析，macOS/Linux 结束进程组以避免合并进程残留。

上传页面通过 XMLHttpRequest 进度事件累计已传字节，每半秒显示传输速度（KB/s 或 MB/s）；文件传完后显示保存记录状态。

```bash
# 1. 安装外部依赖（yt-dlp + ffmpeg）
bash scripts/setup.sh
bash scripts/setup.sh --check     # 校验

# 2. 安装 Node 依赖（注意指定可用 Next 版本）
npm install

# 3. 开发
npm run dev

# 4. 测试
npm run test:unit
npm run test:e2e
```
