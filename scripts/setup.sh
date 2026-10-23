#!/usr/bin/env bash
#
# setup.sh — 跨平台安装视频下载工具的运行依赖（yt-dlp + ffmpeg）
# 支持：macOS、Linux（Debian/Ubuntu、RHEL/CentOS/Fedora、Arch）
#
# 用法：
#   bash scripts/setup.sh          # 安装/更新 yt-dlp 和 ffmpeg
#   bash scripts/setup.sh --check  # 仅检查是否已安装，不做改动
#
set -euo pipefail

# ---------- 工具函数 ----------
info()  { printf "\033[36m[INFO]\033[0m %s\n" "$*"; }
ok()    { printf "\033[32m[ OK ]\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m[WARN]\033[0m %s\n" "$*"; }
err()   { printf "\033[31m[FAIL]\033[0m %s\n" "$*" >&2; }

has() { command -v "$1" >/dev/null 2>&1; }

# ---------- 依赖检查 ----------
check_deps() {
  local missing=0
  if has yt-dlp; then ok "yt-dlp 已安装：$(yt-dlp --version 2>/dev/null)"; else warn "yt-dlp 未安装"; missing=1; fi
  if has ffmpeg; then ok "ffmpeg 已安装：$(ffmpeg -version 2>/dev/null | head -1)"; else warn "ffmpeg 未安装"; missing=1; fi
  return $missing
}

# ---------- 平台检测 ----------
detect_platform() {
  local os
  os="$(uname -s)"
  case "$os" in
    Darwin) echo "macos" ;;
    Linux)  echo "linux" ;;
    *)      echo "unsupported" ;;
  esac
}

# ---------- macOS 安装 ----------
install_macos() {
  if ! has brew; then
    err "未检测到 Homebrew。请先安装：https://brew.sh"
    err '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
  fi
  info "使用 Homebrew 安装 yt-dlp 和 ffmpeg..."
  brew install yt-dlp ffmpeg
}

# ---------- Linux 安装 ----------
install_linux() {
  # ffmpeg 用系统包管理器；yt-dlp 优先用官方二进制（版本最新，最稳）
  if has apt-get; then
    info "检测到 apt（Debian/Ubuntu），安装 ffmpeg..."
    sudo apt-get update -y && sudo apt-get install -y ffmpeg curl
  elif has dnf; then
    info "检测到 dnf（Fedora/RHEL），安装 ffmpeg..."
    sudo dnf install -y ffmpeg curl || warn "ffmpeg 可能需要启用 RPM Fusion 源"
  elif has yum; then
    info "检测到 yum（CentOS/RHEL），安装 ffmpeg..."
    sudo yum install -y ffmpeg curl || warn "ffmpeg 可能需要启用 RPM Fusion 源"
  elif has pacman; then
    info "检测到 pacman（Arch），安装 ffmpeg..."
    sudo pacman -Sy --noconfirm ffmpeg curl
  else
    warn "未识别的 Linux 包管理器，请手动安装 ffmpeg 后重试"
  fi

  install_ytdlp_binary_linux
}

# yt-dlp 官方独立二进制（跨发行版通用，自带更新）
install_ytdlp_binary_linux() {
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
    macos) install_macos ;;
    linux) install_linux ;;
    *)     err "不支持的平台：$(uname -s)（仅支持 macOS / Linux）"; exit 1 ;;
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
