import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHistoryItem, deleteHistoryItem, listHistory } from "@/lib/history";
import { cancelParseTask, createParseTask } from "@/lib/parse-tasks";
import { cancelDownloadTask, createDownloadTask, getTask } from "@/lib/tasks";
import { downloadVideo, parseVideoInfo } from "@/lib/ytdlp";
import type { VideoInfo } from "@/lib/types";
import { DELETE } from "@/app/api/tasks/[id]/route";

jest.mock("@/lib/ytdlp", () => ({ downloadVideo: jest.fn(), parseVideoInfo: jest.fn() }));
jest.mock("@/lib/media", () => ({
  probeDuration: jest.fn(async () => 1),
  ensureThumbnail: jest.fn(async () => undefined),
}));

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "video-task-delete-"));
  process.env.DOWNLOAD_DIR = directory;
});
afterEach(async () => {
  await listHistory();
  await fs.rm(directory, { recursive: true, force: true });
  delete process.env.DOWNLOAD_DIR;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("任务未在预期时间内完成");
}

test("删除解析中和排队解析任务；迟到的解析结果不会恢复记录", async () => {
  const first = deferred<VideoInfo>();
  const second = deferred<VideoInfo>();
  const parse = jest.mocked(parseVideoInfo);
  parse.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const a = await createParseTask("https://example.com/a");
  const b = await createParseTask("https://example.com/b");
  const queued = await createParseTask("https://example.com/queued");
  await cancelParseTask(queued.id);
  await deleteHistoryItem(queued.id);
  const cancelling = cancelParseTask(a.id);
  expect(parse.mock.calls[0][1]?.aborted).toBe(true);
  first.resolve({ url: "https://example.com/a", title: "迟到结果", formats: [] });
  await cancelling;
  await deleteHistoryItem(a.id);
  second.resolve({ url: "https://example.com/b", title: "正常解析", formats: [] });
  await waitUntil(() => {
    const shared = globalThis as typeof globalThis & { __videoDownloaderParseTasks?: { running: number } };
    return shared.__videoDownloaderParseTasks?.running === 0;
  });
  expect(parse).toHaveBeenCalledTimes(2);
  expect((await listHistory()).map((item) => item.id)).toEqual([b.id]);
});

test("删除下载中与排队任务，停止写回，清理合并前残留并释放下载队列", async () => {
  const result = deferred<string>();
  const download = jest.mocked(downloadVideo);
  download.mockImplementationOnce(async (options) => {
    await fs.writeFile(path.join(directory, `${options.fileBaseName}.f137.mp4`), "partial");
    return result.promise;
  });
  const running = await createDownloadTask({ url: "https://example.com/running" });
  const queued = await createDownloadTask({ url: "https://example.com/queued" });
  await cancelDownloadTask(queued.id);
  const queuedRecord = (await listHistory()).find((item) => item.taskId === queued.id)!;
  await deleteHistoryItem(queuedRecord.id);
  const options = download.mock.calls[0][0];
  const cancelling = cancelDownloadTask(running.id);
  expect(options.signal?.aborted).toBe(true);
  // 模拟取消与下载完成同时发生，结果到达后也不能恢复文件映射或任务状态。
  const filename = path.join(directory, `${options.fileBaseName}.mp4`);
  await fs.writeFile(filename, "late");
  result.resolve(filename);
  await cancelling;
  const runningRecord = (await listHistory()).find((item) => item.taskId === running.id)!;
  await deleteHistoryItem(runningRecord.id);
  expect(getTask(running.id)).toBeUndefined();
  expect(getTask(queued.id)).toBeUndefined();
  expect(download).toHaveBeenCalledTimes(1);
  expect(await listHistory()).toEqual([]);
  expect((await fs.readdir(directory)).filter((name) => name.startsWith(options.fileBaseName))).toEqual([]);

  download.mockImplementationOnce(async (next) => {
    const output = path.join(directory, `${next.fileBaseName}.mp4`);
    await fs.writeFile(output, "next");
    return output;
  });
  const next = await createDownloadTask({ url: "https://example.com/next" });
  await waitUntil(() => getTask(next.id)?.status === "done");
  expect(download).toHaveBeenCalledTimes(2);
});

test.each(["created", "parsing", "parsed", "parse_failed", "pending", "running", "done", "failed"] as const)(
  "%s 状态的记录也可以删除",
  async (status) => {
    const item = await createHistoryItem({ title: status, status });
    const response = await DELETE(new Request("http://localhost/api/tasks/" + item.id), { params: { id: item.id } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { id: item.id } });
    expect(await listHistory()).toEqual([]);
  },
);

test("已删除任务的迟到下载请求不会重新创建记录或启动下载", async () => {
  const item = await createHistoryItem({ title: "已删除", url: "https://example.com/video", status: "parsed" });
  await deleteHistoryItem(item.id);
  await expect(createDownloadTask({ historyId: item.id, url: "https://example.com/video" })).rejects.toThrow("任务已删除");
  expect(downloadVideo).not.toHaveBeenCalled();
  expect(await listHistory()).toEqual([]);
});
