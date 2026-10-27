import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { updateHistoryByTaskId, upsertHistory } from "./history";
import { getStorageDir } from "./storage";
import { downloadVideo } from "./ytdlp";
import type { BrowserMedia, DownloadTask } from "./types";

const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS || "1");

type TaskStore = {
  tasks: Map<string, DownloadTask>;
  fileToTask: Map<string, string>;
  queue: string[];
  running: number;
  active: Map<string, { controller: AbortController; completion: Promise<void> }>;
};

const store = getStore();

function getStore(): TaskStore {
  const globalKey = "__videoDownloaderTasks";
  const globalObject = globalThis as typeof globalThis & {
    [globalKey]?: TaskStore;
  };

  if (!globalObject[globalKey]) {
    globalObject[globalKey] = {
      tasks: new Map<string, DownloadTask>(),
      fileToTask: new Map<string, string>(),
      queue: [],
      running: 0,
      active: new Map(),
    };
  }

  globalObject[globalKey].active ??= new Map();
  return globalObject[globalKey];
}

export async function createDownloadTask(input: {
  historyId?: string;
  url: string;
  formatId?: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  browserMedia?: BrowserMedia;
}): Promise<DownloadTask> {
  await fs.mkdir(getStorageDir(), { recursive: true });

  const now = Date.now();
  const task: DownloadTask = {
    id: randomUUID(),
    url: input.url,
    browserMedia: input.browserMedia,
    formatId: input.formatId,
    status: "pending",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.tasks.set(task.id, task);
  await upsertHistory({
    historyId: input.historyId,
    taskId: task.id,
    url: task.url,
    title: input.title,
    thumbnail: input.thumbnail,
    duration: input.duration,
    browserMedia: input.browserMedia,
    formatId: input.formatId,
    status: task.status,
    progress: task.progress,
  }).catch((error) => {
    store.tasks.delete(task.id);
    throw error;
  });
  store.queue.push(task.id);
  void drainQueue();
  return task;
}

export function getTask(taskId: string): DownloadTask | undefined {
  return store.tasks.get(taskId);
}

export function getTaskByFileId(fileId: string): DownloadTask | undefined {
  const taskId = store.fileToTask.get(fileId);
  return taskId ? store.tasks.get(taskId) : undefined;
}

export async function cancelDownloadTask(taskId: string): Promise<void> {
  store.queue = store.queue.filter((id) => id !== taskId);
  store.tasks.delete(taskId);
  for (const [fileId, id] of store.fileToTask) {
    if (id === taskId) store.fileToTask.delete(fileId);
  }
  const active = store.active.get(taskId);
  if (active) {
    active.controller.abort();
    await active.completion;
  }
}

async function drainQueue(): Promise<void> {
  while (store.running < MAX_CONCURRENT_DOWNLOADS && store.queue.length > 0) {
    const taskId = store.queue.shift();
    if (!taskId) {
      return;
    }
    const task = store.tasks.get(taskId);
    if (!task || task.status !== "pending") {
      continue;
    }
    store.running += 1;
    const controller = new AbortController();
    const completion = runTask(task, controller.signal).finally(() => {
      store.running -= 1;
      store.active.delete(taskId);
      void drainQueue();
    });
    store.active.set(taskId, { controller, completion });
  }
}

async function runTask(task: DownloadTask, signal: AbortSignal): Promise<void> {
  const fileId = randomUUID();
  store.fileToTask.set(fileId, task.id);

  updateTask(task.id, {
    status: "running",
    fileId,
    progress: 0,
    updatedAt: Date.now(),
  });

  try {
    const filename = await downloadVideo({
      url: task.url,
      browserMedia: task.browserMedia,
      formatId: task.formatId,
      outputDir: getStorageDir(),
      fileBaseName: fileId,
      signal,
      onProgress: (progress) => {
        updateTask(task.id, {
          progress: progress.progress ?? task.progress,
          speed: progress.speed,
          eta: progress.eta,
          updatedAt: Date.now(),
        });
      },
    });

    if (signal.aborted) return;
    store.fileToTask.set(fileId, task.id);
    const stat = await fs.stat(filename);
    updateTask(task.id, {
      status: "done",
      progress: 100,
      filename,
      fileSize: stat.size,
      fileId,
      updatedAt: Date.now(),
    });
  } catch (error) {
    if (signal.aborted) return;
    updateTask(task.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "下载失败",
      updatedAt: Date.now(),
    });
  }
}

function updateTask(taskId: string, patch: Partial<DownloadTask>): void {
  const current = store.tasks.get(taskId);
  if (!current) {
    return;
  }
  const next = { ...current, ...patch };
  store.tasks.set(taskId, next);
  void updateHistoryByTaskId(taskId, {
    status: next.status,
    progress: next.progress,
    filename: next.filename,
    fileId: next.fileId,
    error: next.error,
    fileSize: next.fileSize,
  }).catch((error) => {
    console.error("更新任务历史失败", error);
  });
}
