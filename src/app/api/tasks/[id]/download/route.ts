import { NextResponse } from "next/server";
import { getHistoryItem } from "@/lib/history";
import { createDownloadTask } from "@/lib/tasks";
import { fail, ok } from "@/lib/types";
import { validateFormatId, ValidationError } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DownloadTaskRequest = {
  formatId?: unknown;
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: DownloadTaskRequest;
  try {
    body = (await request.json()) as DownloadTaskRequest;
  } catch {
    return NextResponse.json(fail("BAD_REQUEST", "请求体不是合法 JSON"), { status: 400 });
  }

  try {
    const item = await getHistoryItem(params.id);
    if (!item || !item.url) {
      return NextResponse.json(fail("TASK_NOT_FOUND", "任务不存在"), { status: 404 });
    }
    if (item.status !== "parsed" && item.status !== "failed") {
      return NextResponse.json(fail("BAD_REQUEST", "当前任务状态不能发起下载"), { status: 400 });
    }

    const formatId = validateFormatId(body.formatId) || item.formatId || item.formats?.[0]?.id;
    const task = await createDownloadTask({
      historyId: item.id,
      url: item.url,
      formatId,
      title: item.title,
      thumbnail: item.thumbnail,
      duration: item.duration,
      browserMedia: item.browserMedia,
    });

    return NextResponse.json(ok({ taskId: task.id, task }));
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(fail("BAD_REQUEST", error.message), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "创建下载任务失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "创建下载任务失败", message), { status: 500 });
  }
}
