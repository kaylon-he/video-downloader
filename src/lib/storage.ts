import path from "node:path";

export function getStorageDir(): string {
  return process.env.DOWNLOAD_DIR || path.join(process.cwd(), "storage");
}
