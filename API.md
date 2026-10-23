# API

所有接口返回统一结构：

```json
{ "ok": true, "data": {} }
```

或：

```json
{ "ok": false, "error": { "code": "INVALID_URL", "message": "链接格式不正确" } }
```

## POST /api/parse

解析视频链接，返回标题、封面、时长和可选格式。

请求：

```json
{
  "url": "https://www.youtube.com/watch?v=..."
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "url": "https://www.youtube.com/watch?v=...",
    "title": "Me at the zoo",
    "thumbnail": "https://...",
    "duration": 19,
    "formats": [
      {
        "id": "bv*+ba/b",
        "label": "最佳画质（自动合并音视频）",
        "hasAudio": true,
        "hasVideo": true
      }
    ]
  }
}
```

常见错误：

- `BAD_REQUEST`：请求体不是合法 JSON。
- `INVALID_URL`：URL 格式、协议或 SSRF 校验失败。
- `YTDLP_NOT_FOUND`：未安装 `yt-dlp`。
- `YTDLP_FAILED`：平台解析失败、风控、视频不存在等。

## POST /api/download

兼容旧接口。创建下载任务，立即返回 `taskId`，下载在服务端异步执行。新页面优先使用任务式接口。

请求：

```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "formatId": "bv*+ba/b"
}
```

`formatId` 可省略，默认使用 `bv*+ba/b`。

成功响应：

```json
{
  "ok": true,
  "data": {
    "taskId": "57a55ff8-f213-4789-81c9-311db6b87138",
    "task": {
      "id": "57a55ff8-f213-4789-81c9-311db6b87138",
      "status": "pending",
      "progress": 0
    }
  }
}
```

常见错误：

- `BAD_REQUEST`：请求体不是合法 JSON。
- `INVALID_URL`：URL 或格式参数校验失败。
- `INTERNAL_ERROR`：任务创建失败。

## GET /api/tasks

读取统一任务列表。返回结构与 `/api/history` 一致。

任务状态：

| status | 说明 |
|---|---|
| `parsing` | 正在解析 |
| `parsed` | 解析成功，等待选择格式并加入下载队列 |
| `parse_failed` | 解析失败 |
| `pending` | 下载排队中 |
| `running` | 下载中 |
| `done` | 下载完成 |
| `failed` | 下载失败 |

## POST /api/tasks/parse

创建解析任务。支持单条 URL、多行 URL 或数组；每个 URL 生成独立任务，互不阻塞。

请求：

```json
{
  "urls": "https://example.com/a.mp4\nhttps://example.com/b.mp4"
}
```

也可以：

```json
{
  "url": "https://example.com/a.mp4"
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "58a2...",
        "url": "https://example.com/a.mp4",
        "title": "https://example.com/a.mp4",
        "status": "parsing",
        "progress": 0
      }
    ]
  }
}
```

常见错误：

- `BAD_REQUEST`：请求体不是合法 JSON，或没有输入 URL。

## POST /api/tasks/[id]/download

从已解析任务创建下载任务。下载状态会写回同一条任务记录。

请求：

```json
{
  "formatId": "bv*+ba/b"
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "taskId": "57a55ff8-f213-4789-81c9-311db6b87138"
  }
}
```

常见错误：

- `TASK_NOT_FOUND`：任务不存在。
- `BAD_REQUEST`：当前任务状态不能下载，或格式参数不合法。
- `INTERNAL_ERROR`：创建下载任务失败。

## DELETE /api/tasks/[id]

删除任务记录。若任务已有本地视频文件和本地缩略图，会一并删除。正在解析、排队或下载中的任务暂不允许删除。

成功响应：

```json
{
  "ok": true,
  "data": {
    "id": "58a2..."
  }
}
```

常见错误：

- `TASK_NOT_FOUND`：任务不存在。
- `BAD_REQUEST`：任务正在运行，暂不能删除。
- `INTERNAL_ERROR`：删除任务失败。

## GET /api/progress?taskId=...

查询下载任务状态。

成功响应：

```json
{
  "ok": true,
  "data": {
    "id": "57a55ff8-f213-4789-81c9-311db6b87138",
    "status": "running",
    "progress": 42.7,
    "speed": "1.23MiB/s",
    "eta": "00:05"
  }
}
```

完成态会包含 `fileId`：

```json
{
  "ok": true,
  "data": {
    "status": "done",
    "progress": 100,
    "fileId": "1e7094be-c87a-428e-be39-36fa8b448591"
  }
}
```

常见错误：

- `BAD_REQUEST`：缺少 `taskId`。
- `TASK_NOT_FOUND`：任务不存在。当前任务存储为单进程内存，服务重启后历史任务会丢失。

## GET /api/file/[id]

下载完成后的文件下载接口。

请求：

```text
GET /api/file/1e7094be-c87a-428e-be39-36fa8b448591
```

成功响应：

- `200`
- `Content-Type: application/octet-stream`
- `Content-Disposition: attachment`

常见错误：

- `BAD_REQUEST`：文件 ID 格式不合法。
- `FILE_NOT_FOUND`：文件不存在、任务未完成或文件已被清理。

## GET /api/stream/[id]

视频播放流接口。与 `/api/file/[id]` 不同，这个接口返回可在线播放的视频流，并支持 `Range` 请求，供浏览器播放器拖动进度。

请求：

```text
GET /api/stream/1e7094be-c87a-428e-be39-36fa8b448591
Range: bytes=0-1023
```

成功响应：

- `200` 或 `206`
- `Content-Type: video/mp4`、`video/webm` 等
- `Accept-Ranges: bytes`

常见错误：

- `BAD_REQUEST`：文件 ID 格式不合法。
- `FILE_NOT_FOUND`：文件不存在、任务未完成或文件已被清理。

## GET /api/history

兼容旧接口。读取任务记录。接口会返回 `storage/history.json` 中的任务历史，并扫描 `storage/` 下现有视频文件，将可识别的 UUID 文件恢复为历史记录。

恢复本地文件时会使用 `ffprobe` 读取时长，并使用 `ffmpeg` 生成本地缩略图。无法识别的损坏视频不会进入历史列表。

成功响应：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "58a2...",
        "title": "Me at the zoo",
        "status": "done",
        "progress": 100,
        "fileId": "1e7094be-c87a-428e-be39-36fa8b448591",
        "thumbnail": "/api/thumbnail/1e7094be-c87a-428e-be39-36fa8b448591",
        "duration": 19,
        "fileSize": 557428,
        "source": "download",
        "createdAt": 1792737453105,
        "updatedAt": 1792737463105
      }
    ]
  }
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `source: "download"` | 由本应用下载任务写入的记录 |
| `source: "recovered"` | 从 `storage/` 现有文件扫描恢复的记录 |
| `fileId` | 可用于 `/api/file/[id]` 下载 |
| `thumbnail` | 可用于展示封面；本地恢复文件会指向 `/api/thumbnail/[id]` |

常见错误：

- `INTERNAL_ERROR`：读取历史记录失败。

## GET /api/thumbnail/[id]

读取本地生成的视频缩略图。

请求：

```text
GET /api/thumbnail/1e7094be-c87a-428e-be39-36fa8b448591
```

成功响应：

- `200`
- `Content-Type: image/jpeg`

常见错误：

- `FILE_NOT_FOUND`：缩略图不存在或文件 ID 不合法。

## 错误码

| code | 含义 |
|---|---|
| `BAD_REQUEST` | 请求格式错误 |
| `INVALID_URL` | URL 或输入校验失败 |
| `UNSUPPORTED_URL` | 暂未支持的链接类型 |
| `YTDLP_NOT_FOUND` | 未安装 `yt-dlp` |
| `YTDLP_FAILED` | `yt-dlp` 解析或下载失败 |
| `TASK_NOT_FOUND` | 任务不存在 |
| `FILE_NOT_FOUND` | 文件不存在 |
| `TASK_FAILED` | 任务失败 |
| `INTERNAL_ERROR` | 服务端内部错误 |
