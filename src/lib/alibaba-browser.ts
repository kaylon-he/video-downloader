import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { BrowserMedia, VideoFormat, VideoInfo } from "./types";

const ALIBABA_HOST_RE = /(^|\.)1688\.com$/i;
const CAPTURE_TIMEOUT_MS = Number(process.env.ALIBABA_BROWSER_CAPTURE_TIMEOUT_MS || "30000");
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

type MediaCandidate = {
  url: string;
  bitrate: number;
};

export function isAlibabaUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return ALIBABA_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

export async function parseAlibabaWithBrowser(sourceUrl: string): Promise<VideoInfo> {
  const browser = await launchBrowser();
  let context: BrowserContext | undefined;

  try {
    context = await browser.newContext({
      locale: "zh-CN",
      viewport: { width: 1365, height: 900 },
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
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

    const pageTitle = (await page.title().catch(() => "")) || "";
    if (/验证码|安全验证|captcha|punish/i.test(pageTitle)) {
      throw new Error("1688 解析失败：页面触发验证码拦截，请先在本机 Chrome 登录并通过验证后再重试。");
    }

    await page
      .locator("video")
      .evaluateAll((videos) => {
        for (const item of videos) {
          const video = item as HTMLVideoElement;
          video.muted = true;
          void video.play().catch(() => undefined);
        }
      })
      .catch(() => undefined);

    await collectDomMedia(page, candidates, sourceUrl);
    await waitForMedia(candidates, CAPTURE_TIMEOUT_MS);
    await collectDomMedia(page, candidates, sourceUrl);

    const video = pickBest(candidates);
    if (!video) {
      throw new Error("1688 解析失败：未捕获到商品页视频流，可能需要登录、通过验证码，或该商品页没有可下载视频。");
    }

    const title = cleanTitle(pageTitle || sourceUrl);
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
      referer: sourceUrl,
      origin: "https://detail.1688.com",
      userAgent: USER_AGENT,
    };
    const formats: VideoFormat[] = [
      {
        id: "browser-capture",
        label: "浏览器捕获视频",
        ext: video.url.includes(".m3u8") ? "m3u8" : "mp4",
        hasAudio: true,
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

async function collectDomMedia(
  page: Page,
  candidates: Map<string, MediaCandidate>,
  sourceUrl: string,
): Promise<void> {
  const urls = await page
    .evaluate(() => {
      const values = new Set<string>();
      for (const video of Array.from(document.querySelectorAll("video"))) {
        const item = video as HTMLVideoElement;
        if (item.currentSrc) values.add(item.currentSrc);
        if (item.src) values.add(item.src);
        for (const source of Array.from(item.querySelectorAll("source"))) {
          if ((source as HTMLSourceElement).src) values.add((source as HTMLSourceElement).src);
        }
      }
      for (const entry of performance.getEntriesByType("resource")) {
        values.add(entry.name);
      }
      return [...values, document.documentElement.innerHTML];
    })
    .catch(() => []);

  for (const value of urls) {
    for (const url of extractMediaUrls(value, sourceUrl)) {
      candidates.set(url, { url, bitrate: bitrateFromUrl(url) });
    }
  }
}

function toMediaCandidate(url: string, contentType?: string): MediaCandidate | null {
  if (!looksLikeMediaUrl(url, contentType)) {
    return null;
  }
  return { url, bitrate: bitrateFromUrl(url) };
}

function looksLikeMediaUrl(input: string, contentType?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }

  const normalized = input.toLowerCase();
  const type = (contentType || "").toLowerCase();
  const isMediaType = /video|mpegurl|mp4|octet-stream/.test(type);
  const isMediaPath = /\.(mp4|m3u8)(?:[?#]|$)/i.test(parsed.pathname) || /cloud\.video\.taobao\.com\/play/i.test(input);
  if (!isMediaType && !isMediaPath) {
    return false;
  }
  if (/\.(js|css|png|jpe?g|webp|gif|svg|woff2?)(?:[?#]|$)/i.test(parsed.pathname)) {
    return false;
  }
  return /1688|alicdn|taobao|tbcdn|mmstat/.test(parsed.hostname) || normalized.includes("cloud.video");
}

function extractMediaUrls(text: string, baseUrl: string): string[] {
  const values = new Set<string>();
  const normalized = text
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
  const matches = normalized.match(/https?:\/\/[^"' <>()]+?(?:\.mp4|\.m3u8|cloud\.video\.taobao\.com\/play)[^"' <>()]*/gi) || [];
  for (const match of matches) {
    try {
      const url = new URL(match, baseUrl).toString();
      if (looksLikeMediaUrl(url)) {
        values.add(url);
      }
    } catch {
      // Ignore malformed script fragments.
    }
  }
  return [...values];
}

async function waitForMedia(candidates: Map<string, MediaCandidate>, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (pickBest(candidates)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function pickBest(candidates: Map<string, MediaCandidate>): MediaCandidate | undefined {
  return [...candidates.values()].sort((a, b) => b.bitrate - a.bitrate)[0];
}

function bitrateFromUrl(input: string): number {
  try {
    const url = new URL(input);
    return Number(url.searchParams.get("br") || url.searchParams.get("bt") || 0);
  } catch {
    return 0;
  }
}

function cleanTitle(title: string): string {
  return title.replace(/\s*-\s*1688.*$/u, "").trim() || "1688 商品视频";
}
