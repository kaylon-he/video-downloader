import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensureThumbnail, probeDuration } from "./media";
import { getStorageDir, getUploadDir } from "./storage";
import type { BrowserMedia, DownloadStatus, HistoryItem, RecordStatus, VideoFormat } from "./types";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type HistoryPatch = Partial<Omit<HistoryItem, "id" | "createdAt">>;

export async function listHistory(): Promise<HistoryItem[]> {
  const items = await ensureRecoveredFiles();
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listDownloadHistory(): Promise<HistoryItem[]> {
  const items = await listHistory();
  return items.filter((item) => item.source !== "upload");
}

export async function listUploadHistory(): Promise<HistoryItem[]> {
  const items = await listHistory();
  return items.filter((item) => item.source === "upload");
}

export async function upsertHistory(input: {
  historyId?: string;
  taskId: string;
  url: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  browserMedia?: BrowserMedia;
  formatId?: string;
  status: DownloadStatus;
  progress: number;
}): Promise<void> {
  await withHistoryLock(async () => {
    const items = await readHistory();
    const now = Date.now();
    const current = input.historyId
      ? items.find((item) => item.id === input.historyId)
      : items.find((item) => item.taskId === input.taskId);

    // 用户删除原任务后，迟到的下载创建请求不能重新插入该记录。
    if (input.historyId && !current) throw new Error("任务已删除");

    if (current) {
      const rest = { ...input };
      delete rest.historyId;
      Object.assign(current, {
        ...compact(rest),
        updatedAt: now,
        source: "download" as const,
      });
    } else {
      items.push({
        id: randomUUID(),
        taskId: input.taskId,
        url: input.url,
        title: input.title || "未命名视频",
        thumbnail: input.thumbnail,
        duration: input.duration,
        browserMedia: input.browserMedia,
        formatId: input.formatId,
        status: input.status,
        progress: input.progress,
        source: "download",
        createdAt: now,
        updatedAt: now,
      });
    }

    await writeHistory(items);
  });
}

export async function createHistoryItem(input: {
  url?: string;
  title?: string;
  status: RecordStatus;
  progress?: number;
  error?: string;
  formats?: VideoFormat[];
  browserMedia?: BrowserMedia;
}): Promise<HistoryItem> {
  return withHistoryLock(async () => {
    const items = await readHistory();
    const now = Date.now();
    const item: HistoryItem = {
      id: randomUUID(),
      url: input.url,
      title: input.title || input.url || "未命名任务",
      status: input.status,
      progress: input.progress ?? 0,
      error: input.error,
      formats: input.formats,
      browserMedia: input.browserMedia,
      source: "download",
      createdAt: now,
      updatedAt: now,
    };
    items.push(item);
    await writeHistory(items);
    return item;
  });
}

export async function createUploadHistoryItem(input: {
  fileId: string;
  filename: string;
  originalName: string;
  fileSize: number;
}): Promise<HistoryItem> {
  let item: HistoryItem = {
    id: randomUUID(),
    title: path.parse(input.originalName).name || input.originalName || "上传视频",
    status: "done",
    progress: 100,
    fileId: input.fileId,
    filename: input.filename,
    fileSize: input.fileSize,
    source: "upload",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  item = await withHistoryLock(async () => {
    const items = await readHistory();
    const existingIndex = items.findIndex((current) => current.fileId === input.fileId);
    if (existingIndex >= 0) {
      item = { ...items[existingIndex], ...item, id: items[existingIndex].id };
      items[existingIndex] = item;
    } else {
      items.push(item);
    }
    await writeHistory(items);
    return item;
  });

  const [duration, thumbnail] = await Promise.all([
    probeDuration(input.filename),
    ensureThumbnail(input.fileId, input.filename),
  ]);
  if (duration || thumbnail) {
    item = await withHistoryLock(async () => {
      const items = await readHistory();
      const index = items.findIndex((current) => current.id === item.id);
      if (index === -1) {
        return item;
      }
      const enriched = { ...items[index], duration, thumbnail, updatedAt: Date.now() };
      items[index] = enriched;
      await writeHistory(items);
      return enriched;
    });
  }
  return item;
}

export async function getHistoryItem(id: string): Promise<HistoryItem | undefined> {
  const items = await listHistory();
  return items.find((item) => item.id === id);
}

export async function deleteHistoryItem(id: string): Promise<HistoryItem | undefined> {
  return withHistoryLock(async () => {
    const items = await readHistory();
    const current = items.find((item) => item.id === id);
    if (!current) {
      return undefined;
    }

    const kept = items.filter((item) => item.id !== id);
    await removeHistoryFiles(current);
    await writeHistory(kept);
    return current;
  });
}

export async function updateHistoryById(id: string, patch: HistoryPatch): Promise<void> {
  await withHistoryLock(async () => {
    const items = await readHistory();
    const current = items.find((item) => item.id === id);
    if (!current) {
      return;
    }

    Object.assign(current, patch, { updatedAt: Date.now() });
    await writeHistory(items);
  });
}

export async function updateHistoryByTaskId(taskId: string, patch: HistoryPatch): Promise<void> {
  await withHistoryLock(async () => {
    const items = await readHistory();
    const current = items.find((item) => item.taskId === taskId);
    if (!current) {
      return;
    }

    Object.assign(current, patch, { updatedAt: Date.now() });
    await writeHistory(items);
  });
}

export async function resolveHistoryFile(fileId: string): Promise<string | null> {
  const items = await ensureRecoveredFiles();
  const record = items.find((item) => item.fileId === fileId && item.filename);
  if (record?.filename) {
    const safePath = resolveInsideStorage(record.filename);
    if (safePath && (await exists(safePath))) {
      return safePath;
    }
  }

  for (const directory of [getStorageDir(), getUploadDir()]) {
    const files = await safeReaddir(directory);
    const match = files.find((name) => {
      const parsed = path.parse(name);
      return getVideoFileId(name) === fileId && VIDEO_EXTENSIONS.has(parsed.ext.toLowerCase());
    });
    if (match) {
      return path.join(directory, match);
    }
  }
  return null;
}

async function ensureRecoveredFiles(): Promise<HistoryItem[]> {
  return withHistoryLock(ensureRecoveredFilesLocked);
}

async function ensureRecoveredFilesLocked(): Promise<HistoryItem[]> {
  await fs.mkdir(getStorageDir(), { recursive: true });
  await fs.mkdir(getUploadDir(), { recursive: true });
  const rawItems = await readHistory();
  const items = await enrichExistingItems(await pruneInvalidRecoveredItems(rawItems));
  const knownFileIds = new Set(items.map((item) => item.fileId).filter(Boolean));
  const directories: Array<{ path: string; source: "recovered" | "upload" }> = [
    { path: getStorageDir(), source: "recovered" },
    { path: getUploadDir(), source: "upload" },
  ];
  let changed = items.length !== rawItems.length;

  for (const directory of directories) {
    const files = await safeReaddir(directory.path);
    for (const name of files) {
      const parsed = path.parse(name);
      const fileId = getVideoFileId(name);
      if (!VIDEO_EXTENSIONS.has(parsed.ext.toLowerCase()) || !fileId || knownFileIds.has(fileId)) {
        continue;
      }

      const filename = path.join(directory.path, name);
      const stat = await fs.stat(filename);
      if (stat.size === 0) {
        continue;
      }
      const duration = directory.source === "recovered" ? await probeDuration(filename) : undefined;
      if (directory.source === "recovered" && !duration) {
        continue;
      }
      const title = directory.source === "upload"
        ? parsed.name.replace(UUID_PREFIX, "").replace(/^-/, "") || "上传视频"
        : `本地文件 ${name}`;
      items.push({
        id: randomUUID(),
        title,
        duration,
        status: "done",
        progress: 100,
        fileId,
        filename,
        fileSize: stat.size,
        thumbnail: await ensureThumbnail(fileId, filename),
        source: directory.source,
        createdAt: stat.birthtimeMs || stat.mtimeMs,
        updatedAt: stat.mtimeMs,
      });
      knownFileIds.add(fileId);
      changed = true;
    }
  }

  if (changed) {
    await writeHistory(items);
  }

  return items;
}

async function enrichExistingItems(items: HistoryItem[]): Promise<HistoryItem[]> {
  let changed = false;
  const enriched: HistoryItem[] = [];

  for (const item of items) {
    const canRecoverCompletedDownload = item.status === "done" || item.progress >= 100;
    if (!canRecoverCompletedDownload || !item.fileId) {
      enriched.push(item);
      continue;
    }

    const filename = item.filename || (await findLocalVideo(item.fileId));
    if (!filename || !(await exists(filename))) {
      enriched.push(item);
      continue;
    }

    const stat = await fs.stat(filename);
    const duration = item.duration || (await probeDuration(filename));
    if (!duration) {
      enriched.push(item);
      continue;
    }
    const localThumbnail = item.thumbnail?.startsWith("/api/thumbnail/")
      ? item.thumbnail
      : await ensureThumbnail(item.fileId, filename);
    const thumbnail = localThumbnail || item.thumbnail;
    const next = {
      ...item,
      status: "done" as const,
      progress: 100,
      filename,
      fileSize: stat.size,
      duration,
      thumbnail,
      error: undefined,
    };

    changed =
      changed ||
      next.status !== item.status ||
      next.progress !== item.progress ||
      next.filename !== item.filename ||
      next.fileSize !== item.fileSize ||
      next.duration !== item.duration ||
      next.thumbnail !== item.thumbnail ||
      next.error !== item.error;
    enriched.push(next);
  }

  if (changed) {
    await writeHistory(enriched);
  }
  return enriched;
}

async function findLocalVideo(fileId: string): Promise<string | undefined> {
  for (const directory of [getStorageDir(), getUploadDir()]) {
    const files = await safeReaddir(directory);
    const match = files.find((name) => {
      const parsed = path.parse(name);
      return getVideoFileId(name) === fileId && VIDEO_EXTENSIONS.has(parsed.ext.toLowerCase());
    });
    if (match) {
      return path.join(directory, match);
    }
  }
  return undefined;
}

async function removeHistoryFiles(item: HistoryItem): Promise<void> {
  const filenames = new Set<string>();
  if (item.filename) {
    filenames.add(item.filename);
  }
  if (item.fileId) {
    // 清理合并前的音视频分片、.part 等残留，不能只删最终视频。
    for (const name of await safeReaddir(getStorageDir())) {
      if (name.startsWith(`${item.fileId}.`) || name.startsWith(`${item.fileId}-`)) {
        filenames.add(path.join(getStorageDir(), name));
      }
    }
    const localVideo = await findLocalVideo(item.fileId);
    if (localVideo) {
      filenames.add(localVideo);
    }
    filenames.add(path.join(getStorageDir(), "thumbnails", `${item.fileId}.jpg`));
  }

  for (const filename of filenames) {
    const safePath = resolveInsideStorage(filename);
    if (safePath) {
      await fs.rm(safePath, { force: true });
    }
  }
}

async function pruneInvalidRecoveredItems(items: HistoryItem[]): Promise<HistoryItem[]> {
  const kept: HistoryItem[] = [];
  for (const item of items) {
    if (item.source !== "recovered" && item.source !== "upload") {
      kept.push(item);
      continue;
    }
    if (!item.filename || !(await exists(item.filename))) {
      continue;
    }
    const stat = await fs.stat(item.filename);
    if (stat.size === 0) {
      continue;
    }
    const duration = item.duration || (item.source === "upload" ? undefined : await probeDuration(item.filename));
    if (!duration && item.source !== "upload") {
      continue;
    }
    kept.push({ ...item, duration, fileSize: stat.size, updatedAt: item.updatedAt || stat.mtimeMs });
  }
  return kept;
}

async function readHistory(): Promise<HistoryItem[]> {
  try {
    const raw = await fs.readFile(getHistoryFile(), "utf8");
    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeHistory(items: HistoryItem[]): Promise<void> {
  await fs.mkdir(getStorageDir(), { recursive: true });
  const historyFile = getHistoryFile();
  const tmpFile = `${historyFile}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  await fs.rename(tmpFile, historyFile);
}

function withHistoryLock<T>(operation: () => Promise<T>): Promise<T> {
  // 不同 API 路由和热更新可能分别加载本模块，文件锁队列必须共享。
  const shared = globalThis as typeof globalThis & { __videoHistoryQueue?: Promise<void> };
  const result = (shared.__videoHistoryQueue ?? Promise.resolve()).then(operation, operation);
  shared.__videoHistoryQueue = result.then(() => undefined, () => undefined);
  return result;
}

function getHistoryFile(): string {
  return path.join(getStorageDir(), "history.json");
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function resolveInsideStorage(filename: string): string | null {
  const storageDir = path.resolve(getStorageDir());
  const filePath = path.resolve(filename);
  return filePath.startsWith(`${storageDir}${path.sep}`) ? filePath : null;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getVideoFileId(filename: string): string | null {
  const parsed = path.parse(filename);
  const match = parsed.name.match(UUID_PREFIX);
  return match?.[0] || null;
}
