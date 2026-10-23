import { NextResponse } from "next/server";
import { deleteHistoryItem, getHistoryItem } from "@/lib/history";
import { fail, ok } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set(["parsing", "pending", "running"]);

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const item = await getHistoryItem(params.id);
    if (!item) {
      return NextResponse.json(fail("TASK_NOT_FOUND", "任务不存在"), { status: 404 });
    }
    if (ACTIVE_STATUSES.has(item.status)) {
      return NextResponse.json(fail("BAD_REQUEST", "运行中的任务暂不能删除"), { status: 400 });
    }

    await deleteHistoryItem(item.id);
    return NextResponse.json(ok({ id: item.id }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除任务失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "删除任务失败", message), { status: 500 });
  }
}
