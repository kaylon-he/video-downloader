import { NextResponse } from "next/server";
import { deleteHistoryItem, getHistoryItem } from "@/lib/history";
import { fail, ok } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const item = await getHistoryItem(params.id);
    if (!item || item.source !== "upload") {
      return NextResponse.json(fail("TASK_NOT_FOUND", "上传视频不存在"), { status: 404 });
    }

    await deleteHistoryItem(item.id);
    return NextResponse.json(ok({ id: item.id }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除上传视频失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "删除上传视频失败", message), { status: 500 });
  }
}
