import { NextResponse } from "next/server";
import { createFailedParseTask, createParseTask } from "@/lib/parse-tasks";
import { fail, ok } from "@/lib/types";
import { validateVideoUrl, ValidationError } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParseTasksRequest = {
  url?: unknown;
  urls?: unknown;
};

export async function POST(request: Request) {
  let body: ParseTasksRequest;
  try {
    body = (await request.json()) as ParseTasksRequest;
  } catch {
    return NextResponse.json(fail("BAD_REQUEST", "请求体不是合法 JSON"), { status: 400 });
  }

  const inputs = normalizeUrls(body);
  if (inputs.length === 0) {
    return NextResponse.json(fail("BAD_REQUEST", "请至少输入一个视频链接"), { status: 400 });
  }

  const items = [];
  for (const input of inputs) {
    try {
      const url = await validateVideoUrl(input);
      items.push(await createParseTask(url));
    } catch (error) {
      const message = error instanceof ValidationError ? error.message : "链接格式不正确";
      items.push(await createFailedParseTask({ url: input, error: message }));
    }
  }

  return NextResponse.json(ok({ items }));
}

function normalizeUrls(body: ParseTasksRequest): string[] {
  const raw = Array.isArray(body.urls) ? body.urls : body.urls ?? body.url;
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}
