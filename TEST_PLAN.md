# 视频下载工具 — 测试计划（TEST PLAN）

> 测试框架：**后端/逻辑单元测试 = Jest（ts-jest）** · **前端页面 E2E = Playwright**
> 对应开发清单见 `TASKS.md`，每条测试标注覆盖的任务编号。
> 状态图例：⬜ 待编写 · 🟡 进行中 · ✅ 已通过

---

## 一、测试分层与工具

| 层级 | 工具 | 范围 | 目录 |
|------|------|------|------|
| 单元测试 | Jest + ts-jest | `lib/` 纯函数、参数拼装、解析逻辑、校验 | `__tests__/unit/` |
| 集成测试 | Jest + supertest | API Route（parse/download/progress/file） | `__tests__/integration/` |
| E2E 测试 | Playwright | 浏览器里走完整用户流程 | `e2e/` |
| 脚本测试 | Jest/bats | `scripts/*.sh` 行为 | `__tests__/scripts/` |

## 二、测试环境约定

| 项 | 约定 |
|----|------|
| 外部命令 | 单元测试 **mock `child_process.spawn`**，不真跑 yt-dlp；集成/E2E 用固定短视频或本地样例 m3u8 | 
| 固定样例 | 准备 1 个公开短视频 URL + 1 个本地 `sample.m3u8`（含分片）作为稳定夹具 |
| 网络 | 单测禁网；集成测试可选 `--runInBand` 跑真实解析（打标记，CI 可跳过） |
| 隔离 | 每个用例用临时下载目录，结束清理 |

---

## 三、后端单元测试（Jest）

| # | 测试点 | 覆盖任务 | 关键断言 | 文件 | 状态 |
|---|--------|---------|---------|------|------|
| U1 | yt-dlp 参数拼装 | 1.1/2.3 | 给定 URL/格式/输出路径，生成的参数数组正确且无注入 | `__tests__/unit/ytdlp.args.test.ts` | ⬜ |
| U2 | 解析 JSON 结果映射 | 1.2 | `yt-dlp -J` 的样例 JSON → 标题/封面/时长/清晰度列表映射正确 | `__tests__/unit/ytdlp.parse.test.ts` | ⬜ |
| U3 | URL 安全校验 | 1.3/4.4 | 非法协议(file/ftp)、内网地址(SSRF)、含 `;|&$` 注入字符被拒 | `__tests__/unit/validate.test.ts` | ⬜ |
| U4 | generic 兜底提取 | 1.4 | 从样例 HTML 中正确扒出 m3u8/mp4；无视频时返回不支持 | `__tests__/unit/generic.test.ts` | ⬜ |
| U5 | 统一返回结构 | 1.5 | 成功/失败/不支持三种结构与错误码符合约定 | `__tests__/unit/types.test.ts` | ⬜ |
| U6 | 进度解析 | 2.5 | yt-dlp stdout 样例行 → 百分比/速度/ETA 解析正确 | `__tests__/unit/progress.test.ts` | ⬜ |
| U7 | 任务状态机 | 2.2/2.9 | pending→running→done/failed 流转；取消/超时/重试 | `__tests__/unit/tasks.test.ts` | ⬜ |
| U8 | 并发队列 | 2.8 | 超过上限的任务进入排队，不超发 | `__tests__/unit/queue.test.ts` | ⬜ |
| U9 | 资源上限 | 4.5 | 超大文件/超时长被拒绝 | `__tests__/unit/limits.test.ts` | ⬜ |

## 四、后端集成测试（Jest + supertest）

| # | 测试点 | 覆盖任务 | 关键断言 | 文件 | 状态 |
|---|--------|---------|---------|------|------|
| I1 | `POST /api/parse` | 1.2 | 合法 URL 返回 200 + 视频信息；非法 URL 返回 400 | `__tests__/integration/parse.test.ts` | ⬜ |
| I2 | `POST /api/download` | 2.1 | 返回 `taskId`，任务进入 pending | `__tests__/integration/download.test.ts` | ⬜ |
| I3 | `GET /api/progress` | 2.6 | 轮询返回递增进度，最终 done | `__tests__/integration/progress.test.ts` | ⬜ |
| I4 | `GET /api/file/:id` | 2.7 | 完成后能下到文件，未完成/过期返回 404 | `__tests__/integration/file.test.ts` | ⬜ |
| I5 | 速率限制 | 4.1 | 超频请求返回 429 | `__tests__/integration/ratelimit.test.ts` | ⬜ |
| I6 | 下载全链路（mock yt-dlp） | 2.1~2.7 | parse→download→progress→file 串联通过 | `__tests__/integration/flow.test.ts` | ⬜ |

## 五、前端 E2E 测试（Playwright）

| # | 场景 | 覆盖任务 | 关键步骤与断言 | 文件 | 状态 |
|---|------|---------|---------------|------|------|
| E1 | 首页渲染 | 3.1 | 输入框、解析按钮可见 | `e2e/home.spec.ts` | ⬜ |
| E2 | 解析成功 | 3.1/3.2 | 输入 URL → 点解析 → 出现封面/标题/清晰度下拉 | `e2e/parse.spec.ts` | ⬜ |
| E3 | 解析失败提示 | 3.6 | 非法 URL → 显示错误提示 | `e2e/parse-error.spec.ts` | ⬜ |
| E4 | 下载流程 + 进度条 | 3.3 | 选清晰度 → 点下载 → 进度条推进 | `e2e/download.spec.ts` | ⬜ |
| E5 | 下载完成 | 3.4 | 进度 100% → 出现保存文件链接且可点击 | `e2e/download-done.spec.ts` | ⬜ |
| E6 | 多任务/历史 | 3.5 | 连续发起多任务，列表正确展示状态 | `e2e/tasks.spec.ts` | ⬜ |
| E7 | 移动端响应式 | 3.7 | 移动视口下布局正常、可操作 | `e2e/responsive.spec.ts` | ⬜ |

## 六、脚本测试

| # | 测试点 | 覆盖任务 | 关键断言 | 文件 | 状态 |
|---|--------|---------|---------|------|------|
| S1 | `setup.sh --check` | 0.5 | 依赖齐全时退出码 0，缺失时非 0 | `__tests__/scripts/setup.test.ts` | ⬜ |
| S2 | `download.sh` 参数 | 0.6 | 缺 URL 报错；非法清晰度参数报错 | `__tests__/scripts/download.test.ts` | ⬜ |

---

## 七、CI 与命令

| 命令 | 作用 |
|------|------|
| `npm run test` | 跑 Jest 全部单元 + 集成（CI 默认，mock 外部命令、禁网） |
| `npm run test:unit` | 仅单元测试 |
| `npm run test:int` | 集成测试 |
| `npm run test:e2e` | Playwright E2E（需先 `next build && next start` 或 dev server） |
| `npm run test:e2e:ui` | Playwright UI 模式调试 |

> CI 建议：PR 必跑 `test:unit + test:int`；E2E 在合并前或定时跑（依赖浏览器环境）。真实网络解析用例打 `@network` 标记，CI 可按需跳过。

## 八、覆盖率目标

| 范围 | 目标 |
|------|------|
| `lib/` 核心逻辑 | 行覆盖 ≥ 80% |
| API Route | 关键路径 100% 走到 |
| E2E | M1 里程碑的主流程全绿 |
