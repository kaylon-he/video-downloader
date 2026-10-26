import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createUploadHistoryItem, listUploadHistory } from "@/lib/history";
import { getUploadDir } from "@/lib/storage";
import { fail, ok } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 1024 * 1024 * 1024);

export async function GET() {
  try {
    const items = await listUploadHistory();
    return NextResponse.json(ok({ items }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取上传列表失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "读取上传列表失败", message), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("videos")
      .filter((entry): entry is File => typeof entry !== "string");
    if (files.length === 0) {
      return NextResponse.json(fail("BAD_REQUEST", "请选择要上传的视频文件"), { status: 400 });
    }

    await fs.mkdir(getUploadDir(), { recursive: true });
    const items = [];
    for (const file of files) {
      const originalName = file.name || "upload.mp4";
      const ext = path.extname(originalName).toLowerCase();
      const mimeLooksLikeVideo = !file.type || file.type.startsWith("video/") || file.type === "application/octet-stream";
      if (!VIDEO_EXTENSIONS.has(ext) || !mimeLooksLikeVideo) {
        return NextResponse.json(fail("UNSUPPORTED_FILE", "仅支持 mp4、mkv、webm、mov、m4v 视频文件"), {
          status: 400,
        });
      }
      if (file.size <= 0) {
        return NextResponse.json(fail("BAD_REQUEST", "视频文件为空"), { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(fail("BAD_REQUEST", "视频文件超过上传大小限制"), { status: 413 });
      }

      const fileId = randomUUID();
      const safeName = sanitizeFilename(originalName);
      const filename = path.join(getUploadDir(), `${fileId}-${safeName}`);
      const bytes = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filename, bytes);
      const item = await createUploadHistoryItem({
        fileId,
        filename,
        originalName,
        fileSize: bytes.length,
      });
      items.push(item);
    }

    return NextResponse.json(ok({ items }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传视频失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "上传视频失败", message), { status: 500 });
  }
}

function sanitizeFilename(filename: string): string {
  const parsed = path.parse(filename);
  const base = (parsed.name || "upload")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const ext = parsed.ext.toLowerCase();
  return `${base || "upload"}${ext}`;
}
