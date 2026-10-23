import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { downloadVideo } from "./ytdlp";
import type { DownloadTask } from "./types";

const STORAGE_DIR = process.env.DOWNLOAD_DIR || path.join(process.cwd(), "storage");
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS || "1");

type TaskStore = {
  tasks: Map<string, DownloadTask>;
  fileToTask: Map<string, string>;
  queue: string[];
  running: number;
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
    };
  }

  return globalObject[globalKey];
}

export async function createDownloadTask(input: {
  url: string;
  formatId?: string;
}): Promise<DownloadTask> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });

  const now = Date.now();
  const task: DownloadTask = {
    id: randomUUID(),
    url: input.url,
    formatId: input.formatId,
    status: "pending",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.tasks.set(task.id, task);
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

export function getStorageDir(): string {
  return STORAGE_DIR;
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
    void runTask(task).finally(() => {
      store.running -= 1;
      void drainQueue();
    });
  }
}

async function runTask(task: DownloadTask): Promise<void> {
  updateTask(task.id, {
    status: "running",
    progress: 0,
    updatedAt: Date.now(),
  });

  const fileId = randomUUID();
  try {
    const filename = await downloadVideo({
      url: task.url,
      formatId: task.formatId,
      outputDir: STORAGE_DIR,
      fileBaseName: fileId,
      onProgress: (progress) => {
        updateTask(task.id, {
          progress: progress.progress ?? task.progress,
          speed: progress.speed,
          eta: progress.eta,
          updatedAt: Date.now(),
        });
      },
    });

    store.fileToTask.set(fileId, task.id);
    updateTask(task.id, {
      status: "done",
      progress: 100,
      filename,
      fileId,
      updatedAt: Date.now(),
    });
  } catch (error) {
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
  store.tasks.set(taskId, { ...current, ...patch });
}
