#!/usr/bin/env bash
#
# setup.sh — 安装 video-downloader 的运行依赖（ffmpeg + yt-dlp）
# 支持：macOS、Fedora Linux（其他系统请手动安装 ffmpeg 与 yt-dlp）
#
# 用法：
#   bash scripts/setup.sh          # 安装/更新 ffmpeg 和 yt-dlp
#   bash scripts/setup.sh --check  # 仅检查依赖（含 H.264 解码能力），不做改动
#
set -euo pipefail

# ---------- 工具函数 ----------
info()  { printf "\033[36m[INFO]\033[0m %s\n" "$*"; }
ok()    { printf "\033[32m[ OK ]\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m[WARN]\033[0m %s\n" "$*"; }
err()   { printf "\033[31m[FAIL]\033[0m %s\n" "$*" >&2; }

has() { command -v "$1" >/dev/null 2>&1; }

# 判断 ffmpeg 是否具备可用的 H.264 解码能力。
# Fedora 自带的 ffmpeg-free 只提供 libopenh264 桩壳（noopenh264 包），
# 无法解码 H.264，表现为上传视频没有缩略图、时长探测失败，必须单独校验。
ffmpeg_has_h264() {
  has ffmpeg || return 1
  local decoders
  # 先取完整输出再匹配：grep -q 会提前退出，pipefail 下会误判为失败
  decoders="$(ffmpeg -hide_banner -decoders 2>/dev/null || true)"
  grep -qE "^[[:space:]]+V[A-Z.]{5}[[:space:]]+h264[[:space:]]" <<<"$decoders"
}

# ---------- 依赖检查 ----------
check_deps() {
  local missing=0
  if has yt-dlp; then ok "yt-dlp 已安装：$(yt-dlp --version 2>/dev/null)"; else warn "yt-dlp 未安装"; missing=1; fi
  if has ffmpeg; then ok "ffmpeg 已安装：$(ffmpeg -version 2>/dev/null | head -1)"; else warn "ffmpeg 未安装"; missing=1; fi
  if has ffmpeg && ! ffmpeg_has_h264; then
    warn "ffmpeg 缺少 H.264 解码器（Fedora 的 ffmpeg-free 无法解码 H.264，需安装 RPM Fusion 完整版 ffmpeg）"
    missing=1
  fi
  return $missing
}

# ---------- 平台检测（仅支持 macOS / Fedora） ----------
detect_platform() {
  local os
  os="$(uname -s)"
  case "$os" in
    Darwin) echo "macos" ;;
    Linux)
      if [[ -r /etc/os-release ]] && grep -qE '^ID=fedora$' /etc/os-release; then
        echo "fedora"
      else
        echo "unsupported"
      fi
      ;;
    *) echo "unsupported" ;;
  esac
}

# ---------- macOS 安装 ----------
install_macos() {
  if ! has brew; then
    err "未检测到 Homebrew。请先安装：https://brew.sh"
    err '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
  fi
  info "使用 Homebrew 安装 ffmpeg 和 yt-dlp..."
  brew install ffmpeg yt-dlp
}

# ---------- Fedora 安装 ----------
install_fedora() {
  local fedora_ver
  fedora_ver="$(rpm -E %fedora)"

  info "安装基础工具 curl..."
  sudo dnf install -y curl

  # RPM Fusion 才提供带完整解码器的 ffmpeg，Fedora 官方源只有 ffmpeg-free
  if rpm -q rpmfusion-free-release >/dev/null 2>&1; then
    ok "RPM Fusion 仓库已启用"
  else
    info "启用 RPM Fusion 仓库..."
    sudo dnf install -y \
      "https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-${fedora_ver}.noarch.rpm" \
      "https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-${fedora_ver}.noarch.rpm"
  fi

  info "安装完整版 ffmpeg（--allowerasing 用于替换 ffmpeg-free）..."
  sudo dnf install -y ffmpeg --allowerasing

  install_ytdlp_binary
}

# yt-dlp 官方独立二进制（自带更新，版本比仓库新）
install_ytdlp_binary() {
  info "安装 yt-dlp 官方二进制到 /usr/local/bin ..."
  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp
  sudo chmod a+rx /usr/local/bin/yt-dlp
}

# ---------- 主流程 ----------
main() {
  if [[ "${1:-}" == "--check" ]]; then
    info "检查依赖..."
    if check_deps; then ok "所有依赖就绪"; exit 0; else err "存在缺失依赖，运行 'bash scripts/setup.sh' 安装"; exit 1; fi
  fi

  info "开始安装依赖..."
  local platform
  platform="$(detect_platform)"
  case "$platform" in
    macos)  install_macos ;;
    fedora) install_fedora ;;
    *)      err "不支持的平台：$(uname -s)（仅支持 macOS / Fedora Linux，其他系统请手动安装 ffmpeg 与 yt-dlp）"; exit 1 ;;
  esac

  echo
  info "安装结果校验："
  if check_deps; then
    ok "依赖安装完成，可以启动项目了"
  else
    err "部分依赖仍缺失，请查看上方日志手动处理"
    exit 1
  fi
}

main "$@"
