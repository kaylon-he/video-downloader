import { NextResponse } from "next/server";
import { getTask } from "@/lib/tasks";
import { fail, ok } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json(fail("BAD_REQUEST", "缺少 taskId"), { status: 400 });
  }

  const task = getTask(taskId);
  if (!task) {
    return NextResponse.json(fail("TASK_NOT_FOUND", "任务不存在"), { status: 404 });
  }

  return NextResponse.json(ok(task));
}
