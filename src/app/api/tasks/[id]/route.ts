import { NextResponse } from "next/server";
import { deleteHistoryItem, getHistoryItem } from "@/lib/history";
import { cancelParseTask, retryParseTask } from "@/lib/parse-tasks";
import { cancelDownloadTask } from "@/lib/tasks";
import { fail, ok } from "@/lib/types";
import { validateVideoUrl, ValidationError } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set(["parsing", "pending", "running"]);

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const item = await getHistoryItem(params.id);
    if (!item) {
      return NextResponse.json(fail("TASK_NOT_FOUND", "任务不存在"), { status: 404 });
    }
    if (ACTIVE_STATUSES.has(item.status)) {
      return NextResponse.json(fail("BAD_REQUEST", "运行中的任务不能重复解析"), { status: 400 });
    }
    if (!item.url) {
      return NextResponse.json(fail("BAD_REQUEST", "任务缺少原始链接"), { status: 400 });
    }

    const url = await validateVideoUrl(item.url);
    await retryParseTask(item.id, url);
    return NextResponse.json(ok({ id: item.id }));
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(fail("INVALID_URL", error.message), { status: 400 });
    }

    const message = error instanceof Error ? error.message : "重新解析失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "重新解析失败", message), { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const item = await getHistoryItem(params.id);
    if (!item) {
      return NextResponse.json(fail("TASK_NOT_FOUND", "任务不存在"), { status: 404 });
    }
    await cancelParseTask(item.id);
    if (item.taskId) await cancelDownloadTask(item.taskId);
    await deleteHistoryItem(item.id);
    return NextResponse.json(ok({ id: item.id }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除任务失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "删除任务失败", message), { status: 500 });
  }
}
