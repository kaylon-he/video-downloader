import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getStorageDir, getTaskByFileId } from "@/lib/tasks";
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
    const task = getTaskByFileId(fileId);
    if (!task || task.status !== "done" || !task.filename) {
      return NextResponse.json(fail("FILE_NOT_FOUND", "文件不存在或已过期"), { status: 404 });
    }

    const storageDir = path.resolve(getStorageDir());
    const filePath = path.resolve(task.filename);
    if (!filePath.startsWith(`${storageDir}${path.sep}`)) {
      return NextResponse.json(fail("FILE_NOT_FOUND", "文件路径不合法"), { status: 404 });
    }

    const file = await fs.readFile(filePath);
    const name = path.basename(filePath);
    return new Response(file, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
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
