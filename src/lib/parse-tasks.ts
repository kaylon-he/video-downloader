import { createHistoryItem, updateHistoryById } from "./history";
import { parseVideoInfo } from "./ytdlp";
import type { HistoryItem } from "./types";

const MAX_CONCURRENT_PARSE = Number(process.env.MAX_CONCURRENT_PARSE || "2");

type ParseStore = {
  queue: string[];
  running: number;
  urls: Map<string, string>;
};

const store = getStore();

function getStore(): ParseStore {
  const globalKey = "__videoDownloaderParseTasks";
  const globalObject = globalThis as typeof globalThis & {
    [globalKey]?: ParseStore;
  };

  if (!globalObject[globalKey]) {
    globalObject[globalKey] = {
      queue: [],
      running: 0,
      urls: new Map<string, string>(),
    };
  }

  return globalObject[globalKey];
}

export async function createParseTask(url: string): Promise<HistoryItem> {
  const item = await createHistoryItem({
    url,
    title: url,
    status: "parsing",
  });
  store.urls.set(item.id, url);
  store.queue.push(item.id);
  void drainQueue();
  return item;
}

export async function retryParseTask(id: string, url: string): Promise<void> {
  store.urls.set(id, url);
  store.queue.push(id);
  await updateHistoryById(id, {
    url,
    title: url,
    thumbnail: undefined,
    duration: undefined,
    formats: undefined,
    formatId: undefined,
    browserMedia: undefined,
    status: "parsing",
    progress: 0,
    error: undefined,
  });
  void drainQueue();
}

export async function createFailedParseTask(input: {
  url?: string;
  error: string;
}): Promise<HistoryItem> {
  return createHistoryItem({
    url: input.url,
    title: input.url || "无效链接",
    status: "parse_failed",
    error: input.error,
  });
}

async function drainQueue(): Promise<void> {
  while (store.running < MAX_CONCURRENT_PARSE && store.queue.length > 0) {
    const id = store.queue.shift();
    if (!id) {
      return;
    }
    const url = store.urls.get(id);
    if (!url) {
      continue;
    }
    store.running += 1;
    void runParseTask(id, url).finally(() => {
      store.running -= 1;
      store.urls.delete(id);
      void drainQueue();
    });
  }
}

async function runParseTask(id: string, url: string): Promise<void> {
  try {
    const info = await parseVideoInfo(url);
    await updateHistoryById(id, {
      url: info.url,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      formats: info.formats,
      browserMedia: info.browserMedia,
      formatId: info.formats[0]?.id,
      status: "parsed",
      progress: 100,
      error: undefined,
    });
  } catch (error) {
    await updateHistoryById(id, {
      status: "parse_failed",
      progress: 0,
      error: error instanceof Error ? error.message : "解析失败",
    });
  }
}
