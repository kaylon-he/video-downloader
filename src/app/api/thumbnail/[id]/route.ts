import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getStorageDir } from "@/lib/storage";
import { fail } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const fileId = validateFileId(params.id);
    const thumbnailPath = path.resolve(getStorageDir(), "thumbnails", `${fileId}.jpg`);
    const thumbnailDir = path.resolve(getStorageDir(), "thumbnails");
    if (!thumbnailPath.startsWith(`${thumbnailDir}${path.sep}`)) {
      return NextResponse.json(fail("FILE_NOT_FOUND", "缩略图不存在"), { status: 404 });
    }

    const stat = await fs.stat(thumbnailPath);
    const stream = createReadStream(thumbnailPath);
    return new Response(Readable.toWeb(stream) as BodyInit, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(fail("FILE_NOT_FOUND", "缩略图不存在"), { status: 404 });
  }
}

function validateFileId(input: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(input)) {
    throw new Error("invalid file id");
  }
  return input;
}
