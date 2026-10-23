#!/usr/bin/env bash
#
# download.sh — 命令行下载入口，复用与后端一致的 yt-dlp 参数策略。
#
# 用法：
#   bash scripts/download.sh "https://example.com/video"
#   bash scripts/download.sh "https://example.com/video" "bv*+ba/b"
#
set -euo pipefail

err() { printf "\033[31m[FAIL]\033[0m %s\n" "$*" >&2; }

url="${1:-}"
format="${2:-bv*+ba/b}"
output_dir="${DOWNLOAD_DIR:-storage}"
cookies_args=()

if [[ -z "$url" ]]; then
  err "缺少 URL"
  exit 1
fi

if [[ ! "$url" =~ ^https?:// ]]; then
  err "仅支持 http/https URL"
  exit 1
fi

if [[ "$url" =~ [\;\&\|\$\`\<\>\\] ]]; then
  err "URL 包含不允许的字符"
  exit 1
fi

if [[ ! "$format" =~ ^[A-Za-z0-9_.+:/,\*-]{1,120}$ ]]; then
  err "格式参数不合法"
  exit 1
fi

mkdir -p "$output_dir"

if [[ "${YTDLP_COOKIES_ENABLED:-false}" == "true" ]]; then
  if [[ -n "${YTDLP_COOKIES_FROM_BROWSER:-}" ]]; then
    err "cookies 文件模式和浏览器读取模式不能同时开启"
    exit 1
  fi
  if [[ -z "${YTDLP_COOKIES_PATH:-}" ]]; then
    err "已开启 cookies，但未配置 YTDLP_COOKIES_PATH"
    exit 1
  fi
  if [[ ! -f "$YTDLP_COOKIES_PATH" ]]; then
    err "cookies 文件不存在或不可读"
    exit 1
  fi
  cookies_args=(--cookies "$YTDLP_COOKIES_PATH")
elif [[ -n "${YTDLP_COOKIES_FROM_BROWSER:-}" ]]; then
  if [[ ! "$YTDLP_COOKIES_FROM_BROWSER" =~ ^[A-Za-z0-9_+-]+(:[A-Za-z0-9_+./\ -]+)?(::[A-Za-z0-9_+./\ -]+)?$ ]]; then
    err "YTDLP_COOKIES_FROM_BROWSER 配置不合法"
    exit 1
  fi
  cookies_args=(--cookies-from-browser "$YTDLP_COOKIES_FROM_BROWSER")
fi

exec yt-dlp \
  "${cookies_args[@]}" \
  --no-playlist \
  --newline \
  --no-part \
  --merge-output-format mp4 \
  -f "$format" \
  -o "$output_dir/%(title).200B-%(id)s.%(ext)s" \
  "$url"
