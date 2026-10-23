import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseDouyinWithBrowser, isDouyinUrl } from "./douyin-browser";
import type { BrowserMedia, VideoFormat, VideoInfo } from "./types";

type RunResult = {
  stdout: string;
  stderr: string;
};

type RawYtdlpFormat = {
  format_id?: string;
  format_note?: string;
  ext?: string;
  resolution?: string;
  height?: number;
  fps?: number;
  filesize?: number;
  filesize_approx?: number;
  vcodec?: string;
  acodec?: string;
};

type RawYtdlpInfo = {
  title?: string;
  thumbnail?: string;
  duration?: number;
  formats?: RawYtdlpFormat[];
};

export type DownloadProgress = {
  progress?: number;
  speed?: string;
  eta?: string;
};

export async function parseVideoInfo(url: string): Promise<VideoInfo> {
  let result: RunResult;
  try {
    result = await runYtdlp(withCookies(["-J", "--no-playlist", "--no-warnings", url]));
  } catch (error) {
    if (isDouyinUrl(url) && isDouyinBrowserFallbackError(error)) {
      return parseDouyinWithBrowser(url);
    }
    throw error;
  }
  let raw: RawYtdlpInfo;
  try {
    raw = JSON.parse(result.stdout) as RawYtdlpInfo;
  } catch {
    throw new Error("yt-dlp 返回了无法解析的数据");
  }

  return {
    url,
    title: raw.title || "未命名视频",
    thumbnail: raw.thumbnail,
    duration: raw.duration,
    formats: mapFormats(raw.formats || []),
  };
}

export async function downloadVideo(options: {
  url: string;
  browserMedia?: BrowserMedia;
  formatId?: string;
  outputDir: string;
  fileBaseName: string;
  onProgress?: (progress: DownloadProgress) => void;
}): Promise<string> {
  if (options.browserMedia) {
    return downloadCapturedMedia({
      browserMedia: options.browserMedia,
      outputDir: options.outputDir,
      fileBaseName: options.fileBaseName,
      onProgress: options.onProgress,
    });
  }

  const outputTemplate = path.join(options.outputDir, `${options.fileBaseName}.%(ext)s`);
  const args = [
    "--no-playlist",
    "--newline",
    "--no-part",
    "--merge-output-format",
    "mp4",
    "-o",
    outputTemplate,
  ];

  if (options.formatId) {
    args.push("-f", options.formatId);
  } else {
    args.push("-f", "bv*+ba/b");
  }
  args.push(options.url);
  const finalArgs = withCookies(args);

  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", finalArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let finalPath = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        const destination = parseDestination(line);
        if (destination) {
          finalPath = destination;
        }
        const progress = parseProgressLine(line);
        if (progress) {
          options.onProgress?.(progress);
        }
      }
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error("未找到 yt-dlp，请先运行 bash scripts/setup.sh"));
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(finalPath || path.join(options.outputDir, `${options.fileBaseName}.mp4`));
        return;
      }
      reject(new Error(normalizeYtdlpError(stderr.trim() || `yt-dlp 退出码 ${code}`)));
    });
  });
}

async function downloadCapturedMedia(options: {
  browserMedia: BrowserMedia;
  outputDir: string;
  fileBaseName: string;
  onProgress?: (progress: DownloadProgress) => void;
}): Promise<string> {
  const outputPath = path.join(options.outputDir, `${options.fileBaseName}.mp4`);
  const freshInfo = await parseDouyinWithBrowser(options.browserMedia.sourceUrl);
  const freshMedia = freshInfo.browserMedia || options.browserMedia;
  const args = ["-y", "-hide_banner", "-loglevel", "error", ...capturedMediaInputArgs(freshMedia.videoUrl)];

  if (freshMedia.audioUrl) {
    args.push(...capturedMediaInputArgs(freshMedia.audioUrl), "-map", "0:v:0", "-map", "1:a:0");
  }

  args.push("-c", "copy", "-movflags", "+faststart", outputPath);
  options.onProgress?.({ progress: 5 });

  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error("未找到 ffmpeg，请先运行 bash scripts/setup.sh"));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        options.onProgress?.({ progress: 100 });
        resolve(outputPath);
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg 退出码 ${code}`));
    });
  });
}

function capturedMediaInputArgs(url: string): string[] {
  return [
    "-user_agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "-headers",
    "Referer: https://www.douyin.com/\r\nOrigin: https://www.douyin.com\r\n",
    "-i",
    url,
  ];
}

export function buildDownloadArgs(input: {
  url: string;
  formatId?: string;
  outputTemplate: string;
}): string[] {
  const args = [
    "--no-playlist",
    "--newline",
    "--no-part",
    "--merge-output-format",
    "mp4",
    "-o",
    input.outputTemplate,
  ];
  args.push("-f", input.formatId || "bv*+ba/b");
  args.push(input.url);
  return withCookies(args);
}

export function getCookiesArgs(): string[] {
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  const fileEnabled = process.env.YTDLP_COOKIES_ENABLED === "true";

  if (browser && fileEnabled) {
    throw new Error("cookies 文件模式和浏览器读取模式不能同时开启");
  }

  if (browser) {
    if (!/^[A-Za-z0-9_+-]+(?::[A-Za-z0-9_+./ -]+)?(?:::[A-Za-z0-9_+./ -]+)?$/.test(browser)) {
      throw new Error("YTDLP_COOKIES_FROM_BROWSER 配置不合法");
    }
    return ["--cookies-from-browser", browser];
  }

  if (!fileEnabled) {
    return [];
  }

  const cookiesPath = process.env.YTDLP_COOKIES_PATH?.trim();
  if (!cookiesPath) {
    throw new Error("已开启 cookies，但未配置 YTDLP_COOKIES_PATH");
  }

  const resolvedPath = path.resolve(process.cwd(), cookiesPath);
  const stat = safeStat(resolvedPath);
  if (!stat?.isFile()) {
    throw new Error("cookies 文件不存在或不可读");
  }

  return ["--cookies", resolvedPath];
}

export function parseProgressLine(line: string): DownloadProgress | null {
  const percent = line.match(/\[download]\s+(\d+(?:\.\d+)?)%/);
  if (!percent) {
    return null;
  }
  const speed = line.match(/\bat\s+([^\s]+)/);
  const eta = line.match(/\bETA\s+([^\s]+)/);

  return {
    progress: Number(percent[1]),
    speed: speed?.[1],
    eta: eta?.[1],
  };
}

function runYtdlp(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error("未找到 yt-dlp，请先运行 bash scripts/setup.sh"));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(normalizeYtdlpError(stderr.trim() || `yt-dlp 退出码 ${code}`)));
    });
  });
}

function normalizeYtdlpError(message: string): string {
  if (
    message.includes("[Douyin]") &&
    (message.includes("Fresh cookies") ||
      message.includes("ArgusSecurityPlugin") ||
      message.includes("encrypt_data_miss"))
  ) {
    return [
      "抖音解析失败：当前 yt-dlp 无法通过抖音网页风控校验。",
      "已读取浏览器登录 Cookie，但抖音详情接口仍要求前端生成的签名/校验参数。",
      "请等待 yt-dlp 上游修复 Douyin 提取器，或改用浏览器模式解析。",
    ].join(" ");
  }

  return message;
}

function isDouyinBrowserFallbackError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("[Douyin]") ||
    message.includes("抖音解析失败") ||
    message.includes("ArgusSecurityPlugin") ||
    message.includes("encrypt_data_miss")
  );
}

function withCookies(args: string[]): string[] {
  const cookiesArgs = getCookiesArgs();
  if (cookiesArgs.length === 0) {
    return args;
  }

  return [...cookiesArgs, ...args];
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function mapFormats(formats: RawYtdlpFormat[]): VideoFormat[] {
  const mapped = formats
    .filter((format) => format.format_id)
    .map((format) => {
      const hasAudio = format.acodec !== "none";
      const hasVideo = format.vcodec !== "none";
      const height = format.height;
      const resolution = format.resolution || (height ? `${height}p` : format.format_note);
      return {
        id: format.format_id || "",
        label: formatLabel({ ...format, resolution }),
        ext: format.ext,
        resolution,
        height,
        fps: format.fps,
        filesize: format.filesize || format.filesize_approx,
        hasAudio,
        hasVideo,
      };
    });

  const bestOption: VideoFormat = {
    id: "bv*+ba/b",
    label: "最佳画质（自动合并音视频）",
    hasAudio: true,
    hasVideo: true,
  };

  return [
    bestOption,
    ...mapped
      .filter((format) => format.hasVideo)
      .sort((a, b) => (b.height || 0) - (a.height || 0))
      .slice(0, 20),
  ];
}

function formatLabel(format: RawYtdlpFormat): string {
  const parts = [
    format.resolution || format.format_note || format.format_id,
    format.ext,
    format.fps ? `${format.fps}fps` : undefined,
    format.acodec === "none" ? "无音频" : undefined,
  ].filter(Boolean);
  return parts.join(" · ");
}

function parseDestination(line: string): string | null {
  const match = line.match(/\[Merger]\s+Merging formats into "(.+)"$/);
  if (match) {
    return match[1];
  }
  const destination = line.match(/\[download]\s+Destination:\s+(.+)$/);
  return destination?.[1] || null;
}
