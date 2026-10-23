import { NextResponse } from "next/server";
import { listHistory } from "@/lib/history";
import { fail, ok } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listHistory();
    return NextResponse.json(ok({ items }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取历史记录失败";
    return NextResponse.json(fail("INTERNAL_ERROR", "读取历史记录失败", message), {
      status: 500,
    });
  }
}
