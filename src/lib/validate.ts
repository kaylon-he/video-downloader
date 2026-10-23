import dns from "node:dns/promises";
import net from "node:net";
import type { LookupAddress } from "node:dns";

const SHELL_META_RE = /[;&|$`<>\\]/;
const MAX_URL_LENGTH = 2048;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function validateVideoUrl(input: unknown): Promise<string> {
  if (typeof input !== "string") {
    throw new ValidationError("请输入视频链接");
  }

  const raw = input.trim();
  if (!raw) {
    throw new ValidationError("请输入视频链接");
  }
  if (raw.length > MAX_URL_LENGTH) {
    throw new ValidationError("链接过长");
  }
  if (SHELL_META_RE.test(raw)) {
    throw new ValidationError("链接包含不允许的字符");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ValidationError("链接格式不正确");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError("仅支持 http/https 链接");
  }
  if (!parsed.hostname) {
    throw new ValidationError("链接缺少主机名");
  }

  await rejectPrivateHost(parsed.hostname);
  return parsed.toString();
}

export function validateFormatId(input: unknown): string | undefined {
  if (input === undefined || input === null || input === "") {
    return undefined;
  }
  if (typeof input !== "string") {
    throw new ValidationError("格式参数不正确");
  }
  const value = input.trim();
  if (!/^[\w.+:/,*-]{1,120}$/.test(value)) {
    throw new ValidationError("格式参数包含不允许的字符");
  }
  return value;
}

export function validateFileId(input: string): string {
  if (!/^[a-f0-9-]{36}$/.test(input)) {
    throw new ValidationError("文件编号不正确");
  }
  return input;
}

async function rejectPrivateHost(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost") {
    throw new ValidationError("不允许访问本机地址");
  }

  const literalType = net.isIP(normalized);
  if (literalType !== 0) {
    if (isPrivateIp(normalized)) {
      throw new ValidationError("不允许访问内网地址");
    }
    return;
  }

  let records: LookupAddress[];
  try {
    records = await dns.lookup(normalized, { all: true, verbatim: true });
  } catch {
    throw new ValidationError("域名解析失败");
  }

  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new ValidationError("不允许访问内网地址");
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }

  return true;
}
