import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolveHistoryFile } from "@/lib/history";
import { getStorageDir } from "@/lib/storage";
import { getTaskByFileId } from "@/lib/tasks";
import { fail } from "@/lib/types";
import { validateFileId, ValidationError } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const fileId = validateFileId(params.id);
    const task = getTaskByFileId(fileId);
    const filename =
      task?.status === "done" && task.filename ? task.filename : await resolveHistoryFile(fileId);
    if (!filename) {
      return NextResponse.json(fail("FILE_NOT_FOUND", "文件不存在或已过期"), { status: 404 });
    }

    const storageDir = path.resolve(getStorageDir());
    const filePath = path.resolve(filename);
    if (!filePath.startsWith(`${storageDir}${path.sep}`)) {
      return NextResponse.json(fail("FILE_NOT_FOUND", "文件路径不合法"), { status: 404 });
    }

    const stat = await fs.stat(filePath);
    const contentType = getVideoContentType(filePath);
    const range = request.headers.get("range");

    if (range) {
      const parsed = parseRange(range, stat.size);
      if (!parsed) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${stat.size}`,
          },
        });
      }

      const stream = createReadStream(filePath, { start: parsed.start, end: parsed.end });
      return new Response(Readable.toWeb(stream) as BodyInit, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=300",
          "Content-Length": String(parsed.end - parsed.start + 1),
          "Content-Range": `bytes ${parsed.start}-${parsed.end}/${stat.size}`,
          "Content-Type": contentType,
        },
      });
    }

    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as BodyInit, {
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(stat.size),
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(fail("BAD_REQUEST", error.message), { status: 400 });
    }
    return NextResponse.json(fail("FILE_NOT_FOUND", "文件不存在或已过期"), { status: 404 });
  }
}

function parseRange(range: string, size: number): { start: number; end: number } | null {
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return null;
  }

  const [, startValue, endValue] = match;
  if (!startValue && !endValue) {
    return null;
  }

  if (!startValue) {
    const suffixLength = Number(endValue);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    const start = Math.max(0, size - suffixLength);
    return { start, end: size - 1 };
  }

  const start = Number(startValue);
  const end = endValue ? Number(endValue) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function getVideoContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".webm") return "video/webm";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".m4v") return "video/x-m4v";
  return "video/mp4";
}
