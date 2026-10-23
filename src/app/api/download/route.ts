import { NextResponse } from "next/server";
import { createDownloadTask } from "@/lib/tasks";
import { fail, ok, type DownloadRequest } from "@/lib/types";
import { validateFormatId, validateVideoUrl, ValidationError } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: DownloadRequest;
  try {
    body = (await request.json()) as DownloadRequest;
  } catch {
    return NextResponse.json(fail("BAD_REQUEST", "请求体不是合法 JSON"), { status: 400 });
  }

  try {
    const url = await validateVideoUrl(body.url);
    const formatId = validateFormatId(body.formatId);
    const task = await createDownloadTask({
      url,
      formatId,
      title: stringValue(body.title, 240),
      thumbnail: stringValue(body.thumbnail, 2048),
      duration: numberValue(body.duration),
    });
    return NextResponse.json(ok({ taskId: task.id, task }));
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(fail("INVALID_URL", error.message), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "创建任务失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "创建任务失败", message), { status: 500 });
  }
}

function stringValue(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const value = input.trim();
  return value ? value.slice(0, maxLength) : undefined;
}

function numberValue(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) ? input : undefined;
}
