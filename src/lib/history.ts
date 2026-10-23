import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensureThumbnail, probeDuration } from "./media";
import { getStorageDir } from "./storage";
import type { DownloadStatus, HistoryItem } from "./types";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);

type HistoryPatch = Partial<Omit<HistoryItem, "id" | "createdAt">>;

export async function listHistory(): Promise<HistoryItem[]> {
  const items = await ensureRecoveredFiles();
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertHistory(input: {
  taskId: string;
  url: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  status: DownloadStatus;
  progress: number;
}): Promise<void> {
  const items = await readHistory();
  const now = Date.now();
  const current = items.find((item) => item.taskId === input.taskId);

  if (current) {
    Object.assign(current, {
      ...compact(input),
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
      status: input.status,
      progress: input.progress,
      source: "download",
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeHistory(items);
}

export async function updateHistoryByTaskId(taskId: string, patch: HistoryPatch): Promise<void> {
  const items = await readHistory();
  const current = items.find((item) => item.taskId === taskId);
  if (!current) {
    return;
  }

  Object.assign(current, compact(patch), { updatedAt: Date.now() });
  await writeHistory(items);
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

  const storageDir = getStorageDir();
  const files = await safeReaddir(storageDir);
  const match = files.find((name) => {
    const parsed = path.parse(name);
    return parsed.name === fileId && VIDEO_EXTENSIONS.has(parsed.ext.toLowerCase());
  });

  return match ? path.join(storageDir, match) : null;
}

async function ensureRecoveredFiles(): Promise<HistoryItem[]> {
  await fs.mkdir(getStorageDir(), { recursive: true });
  const rawItems = await readHistory();
  const items = await enrichExistingItems(await pruneInvalidRecoveredItems(rawItems));
  const knownFileIds = new Set(items.map((item) => item.fileId).filter(Boolean));
  const files = await safeReaddir(getStorageDir());
  let changed = items.length !== rawItems.length;

  for (const name of files) {
    const parsed = path.parse(name);
    if (!VIDEO_EXTENSIONS.has(parsed.ext.toLowerCase()) || knownFileIds.has(parsed.name)) {
      continue;
    }

    const filename = path.join(getStorageDir(), name);
    const stat = await fs.stat(filename);
    if (stat.size === 0) {
      continue;
    }
    const duration = await probeDuration(filename);
    if (!duration) {
      continue;
    }
    items.push({
      id: randomUUID(),
      title: `本地文件 ${name}`,
      duration,
      status: "done",
      progress: 100,
      fileId: parsed.name,
      filename,
      fileSize: stat.size,
      thumbnail: await ensureThumbnail(parsed.name, filename),
      source: "recovered",
      createdAt: stat.birthtimeMs || stat.mtimeMs,
      updatedAt: stat.mtimeMs,
    });
    changed = true;
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
    if (item.status !== "done" || !item.fileId) {
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
    const thumbnail = item.thumbnail || (await ensureThumbnail(item.fileId, filename));
    const next = {
      ...item,
      filename,
      fileSize: stat.size,
      duration,
      thumbnail,
    };

    changed =
      changed ||
      next.filename !== item.filename ||
      next.fileSize !== item.fileSize ||
      next.duration !== item.duration ||
      next.thumbnail !== item.thumbnail;
    enriched.push(next);
  }

  if (changed) {
    await writeHistory(enriched);
  }
  return enriched;
}

async function findLocalVideo(fileId: string): Promise<string | undefined> {
  const files = await safeReaddir(getStorageDir());
  const match = files.find((name) => {
    const parsed = path.parse(name);
    return parsed.name === fileId && VIDEO_EXTENSIONS.has(parsed.ext.toLowerCase());
  });
  return match ? path.join(getStorageDir(), match) : undefined;
}

async function pruneInvalidRecoveredItems(items: HistoryItem[]): Promise<HistoryItem[]> {
  const kept: HistoryItem[] = [];
  for (const item of items) {
    if (item.source !== "recovered") {
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
    const duration = item.duration || (await probeDuration(item.filename));
    if (!duration) {
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
  const tmpFile = `${historyFile}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  await fs.rename(tmpFile, historyFile);
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
