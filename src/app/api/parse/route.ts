import { NextResponse } from "next/server";
import { parseVideoInfo } from "@/lib/ytdlp";
import { fail, ok, type ParseRequest } from "@/lib/types";
import { validateVideoUrl, ValidationError } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: ParseRequest;
  try {
    body = (await request.json()) as ParseRequest;
  } catch {
    return NextResponse.json(fail("BAD_REQUEST", "请求体不是合法 JSON"), { status: 400 });
  }

  try {
    const url = await validateVideoUrl(body.url);
    const info = await parseVideoInfo(url);
    return NextResponse.json(ok(info));
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(fail("INVALID_URL", error.message), { status: 400 });
    }

    const message = error instanceof Error ? error.message : "解析失败";
    const code = message.includes("未找到 yt-dlp") ? "YTDLP_NOT_FOUND" : "YTDLP_FAILED";
    return NextResponse.json(fail(code, "解析失败", message), { status: 500 });
  }
}
