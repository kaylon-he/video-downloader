import { chromium, type Browser, type BrowserContext } from "playwright";
import type { BrowserMedia, VideoFormat, VideoInfo } from "./types";

const DOUYIN_HOST_RE = /(^|\.)douyin\.com$/i;
const MEDIA_HOST_RE = /(^|\.)douyinvod\.com$/i;
const CAPTURE_TIMEOUT_MS = Number(process.env.DOUYIN_BROWSER_CAPTURE_TIMEOUT_MS || "25000");
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

type MediaCandidate = {
  url: string;
  bitrate: number;
  kind: "audio" | "video";
};

export function isDouyinUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return DOUYIN_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

export async function parseDouyinWithBrowser(sourceUrl: string): Promise<VideoInfo> {
  const browser = await launchBrowser();
  let context: BrowserContext | undefined;

  try {
    context = await browser.newContext({
      locale: "zh-CN",
      viewport: { width: 1280, height: 800 },
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();
    const candidates = new Map<string, MediaCandidate>();

    page.on("response", (response) => {
      const candidate = toMediaCandidate(response.url(), response.headers()["content-type"]);
      if (candidate) {
        candidates.set(candidate.url, candidate);
      }
    });

    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: CAPTURE_TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
    await page
      .locator("video")
      .first()
      .evaluate((video) => (video as HTMLVideoElement).play().catch(() => undefined))
      .catch(() => undefined);

    await waitForMedia(candidates, CAPTURE_TIMEOUT_MS);

    const video = pickBest(candidates, "video");
    const audio = pickBest(candidates, "audio");
    if (!video) {
      throw new Error("浏览器模式未捕获到抖音视频流");
    }

    const title = cleanTitle((await page.title().catch(() => "")) || sourceUrl);
    const duration = await page
      .locator("video")
      .evaluateAll((videos) => {
        const values = videos
          .map((item) => (item as HTMLVideoElement).duration)
          .filter((value) => Number.isFinite(value) && value > 0);
        return values[0];
      })
      .catch(() => undefined);

    const browserMedia: BrowserMedia = {
      sourceUrl,
      videoUrl: video.url,
      audioUrl: audio?.url,
      referer: "https://www.douyin.com/",
      origin: "https://www.douyin.com",
      userAgent: USER_AGENT,
    };
    const formats: VideoFormat[] = [
      {
        id: "browser-capture",
        label: audio ? "浏览器捕获（自动合并音视频）" : "浏览器捕获视频",
        ext: "mp4",
        hasAudio: Boolean(audio),
        hasVideo: true,
      },
    ];

    return {
      url: sourceUrl,
      title,
      duration,
      formats,
      browserMedia,
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

function toMediaCandidate(url: string, contentType?: string): MediaCandidate | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!MEDIA_HOST_RE.test(parsed.hostname) || !/video|mp4|octet-stream/i.test(contentType || "")) {
    return null;
  }

  const pathname = parsed.pathname.toLowerCase();
  const mime = parsed.searchParams.get("mime_type") || "";
  const isAudio = pathname.includes("media-audio") || mime.includes("audio");
  const isVideo = pathname.includes("media-video") || mime.includes("video");
  if (!isAudio && !isVideo) {
    return null;
  }

  return {
    url,
    kind: isAudio ? "audio" : "video",
    bitrate: Number(parsed.searchParams.get("br") || parsed.searchParams.get("bt") || 0),
  };
}

async function waitForMedia(candidates: Map<string, MediaCandidate>, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pickBest(candidates, "video")) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function pickBest(candidates: Map<string, MediaCandidate>, kind: "audio" | "video"): MediaCandidate | undefined {
  return [...candidates.values()]
    .filter((candidate) => candidate.kind === kind)
    .sort((a, b) => b.bitrate - a.bitrate)[0];
}

function cleanTitle(title: string): string {
  return title.replace(/\s*-\s*抖音\s*$/u, "").trim() || "抖音视频";
}
