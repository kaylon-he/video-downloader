import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getStorageDir } from "./storage";

type ProbeResult = {
  format?: {
    duration?: string;
  };
};

export async function probeDuration(filename: string): Promise<number | undefined> {
  const result = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    filename,
  ]);
  if (!result.ok) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(result.stdout) as ProbeResult;
    const duration = Number(parsed.format?.duration);
    return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined;
  } catch {
    return undefined;
  }
}

export async function ensureThumbnail(fileId: string, filename: string): Promise<string | undefined> {
  const thumbnailDir = path.join(getStorageDir(), "thumbnails");
  const thumbnailPath = path.join(thumbnailDir, `${fileId}.jpg`);
  await fs.mkdir(thumbnailDir, { recursive: true });

  if (await exists(thumbnailPath)) {
    return `/api/thumbnail/${fileId}`;
  }

  const result = await runCommand("ffmpeg", [
    "-y",
    "-ss",
    "00:00:01",
    "-i",
    filename,
    "-frames:v",
    "1",
    "-vf",
    "scale=320:-1",
    thumbnailPath,
  ]);

  if (!result.ok || !(await exists(thumbnailPath))) {
    return undefined;
  }
  return `/api/thumbnail/${fileId}`;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<{ ok: true; stdout: string } | { ok: false }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false });
    }, 15000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true, stdout } : { ok: false });
    });
  });
}

async function exists(filename: string): Promise<boolean> {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}
