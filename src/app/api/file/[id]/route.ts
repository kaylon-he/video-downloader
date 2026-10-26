import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolveHistoryFile } from "@/lib/history";
import { getStorageDir } from "@/lib/storage";
import { fail } from "@/lib/types";
import { validateFileId, ValidationError } from "@/lib/validate";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const fileId = validateFileId(id);
    const filename = await resolveHistoryFile(fileId);
    if (!filename) {
      return NextResponse.json(fail("FILE_NOT_FOUND", "文件不存在或已过期"), { status: 404 });
    }

    const storageDir = path.resolve(getStorageDir());
    const filePath = path.resolve(filename);
    if (!filePath.startsWith(`${storageDir}${path.sep}`)) {
      return NextResponse.json(fail("FILE_NOT_FOUND", "文件路径不合法"), { status: 404 });
    }

    const stat = await fs.stat(filePath);
    const stream = createReadStream(filePath);
    const name = path.basename(filePath);
    return new Response(Readable.toWeb(stream) as BodyInit, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(fail("BAD_REQUEST", error.message), { status: 400 });
    }
    return NextResponse.json(fail("FILE_NOT_FOUND", "文件不存在或已过期"), { status: 404 });
  }
}
