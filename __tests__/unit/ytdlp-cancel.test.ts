import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { downloadVideo, parseVideoInfo } from "@/lib/ytdlp";

jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
jest.mock("@/lib/alibaba-browser", () => ({
  isAlibabaUrl: () => false, parseAlibabaWithBrowser: jest.fn(),
}));
jest.mock("@/lib/douyin-browser", () => ({
  isDouyinUrl: () => false, parseDouyinWithBrowser: jest.fn(),
}));

test.each(["parse", "download", "merge"] as const)("%s 取消会结束子进程并等待 close", async (mode) => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: jest.fn(() => { setImmediate(() => child.emit("close", null)); return true; }),
  });
  jest.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  const controller = new AbortController();
  const operation = mode === "parse"
    ? parseVideoInfo("https://example.com/video", controller.signal)
    : downloadVideo({
      url: "https://example.com/video", outputDir: "/tmp", fileBaseName: "test",
      signal: controller.signal,
      browserMedia: mode === "merge" ? {
        sourceUrl: "https://example.com/video", videoUrl: "https://example.com/video.mp4",
      } : undefined,
    });
  // 浏览器媒体路径在刷新源地址后才启动 ffmpeg。
  await Promise.resolve();
  expect(spawn).toHaveBeenCalledTimes(1);
  const assertion = expect(operation).rejects.toThrow();
  controller.abort();
  await assertion;
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  expect(spawn).toHaveBeenCalledWith(
    mode === "merge" ? "ffmpeg" : "yt-dlp",
    expect.any(Array),
    expect.objectContaining({ detached: process.platform !== "win32" }),
  );
});

test("已取消的解析请求不会启动外部命令", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(parseVideoInfo("https://example.com/video", controller.signal)).rejects.toThrow();
  expect(spawn).not.toHaveBeenCalled();
});

test("macOS/Linux 取消下载会结束整个进程组", async () => {
  if (process.platform === "win32") return;
  const child = Object.assign(new EventEmitter(), {
    pid: 123456,
    stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(),
  });
  jest.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  const killGroup = jest.spyOn(process, "kill").mockImplementation(() => true);
  try {
    const controller = new AbortController();
    const operation = downloadVideo({
      url: "https://example.com/video", outputDir: "/tmp", fileBaseName: "test", signal: controller.signal,
    });
    const assertion = expect(operation).rejects.toThrow();
    controller.abort();
    expect(killGroup).toHaveBeenCalledWith(-123456, "SIGKILL");
    child.emit("close", null);
    await assertion;
  } finally {
    killGroup.mockRestore();
  }
});
