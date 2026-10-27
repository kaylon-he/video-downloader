import { test, expect } from "@playwright/test";
import type { HistoryItem, RecordStatus } from "../src/lib/types";

test.use({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3000" });

test("所有状态都可删除，取消确认保留记录，确认后记录消失", async ({ page }) => {
  const statuses: RecordStatus[] = ["created", "parsing", "parsed", "parse_failed", "pending", "running", "done", "failed"];
  let items: HistoryItem[] = statuses.map((status, index) => ({
    id: String(index), title: `测试 ${status}`, status, progress: 0,
    source: "download", createdAt: 1, updatedAt: 1,
  }));
  await page.route("**/api/tasks", (route) => route.fulfill({ json: { ok: true, data: { items } } }));
  await page.route("**/api/uploads", (route) => route.fulfill({ json: { ok: true, data: { items: [] } } }));
  await page.route("**/api/tasks/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    items = items.filter((item) => item.id !== id);
    return route.fulfill({ json: { ok: true, data: { id } } });
  });
  await page.goto("/");
  await expect(page.locator("article")).toHaveCount(8);
  for (const button of await page.getByRole("button", { name: "删除", exact: true }).all()) {
    await expect(button).toBeEnabled();
  }
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "删除", exact: true }).first().click();
  await expect(page.locator("article")).toHaveCount(8);
  page.on("dialog", (dialog) => dialog.accept());
  for (const status of statuses) {
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: `测试 ${status}`, exact: true }) });
    await card.getByRole("button", { name: "删除", exact: true }).click();
    await expect(card).toHaveCount(0);
  }
});

test("上传速度随传输更新，停止传输显示零速度，传完后显示保存状态", async ({ page }) => {
  await page.route("**/api/tasks", (route) => route.fulfill({ json: { ok: true, data: { items: [] } } }));
  await page.route("**/api/uploads", (route) => route.fulfill({ json: { ok: true, data: { items: [] } } }));
  await page.addInitScript(() => {
    class MockUploadRequest extends EventTarget {
      upload = new EventTarget();
      status = 200;
      responseText = JSON.stringify({ ok: true, data: { items: [] } });
      open() {}
      send() {
        const total = 1024 * 1024;
        setTimeout(() => {
          this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: total / 4, total }));
        }, 100);
        setTimeout(() => {
          this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: total, total }));
          this.upload.dispatchEvent(new ProgressEvent("load"));
        }, 1800);
        setTimeout(() => {
          this.dispatchEvent(new Event("load"));
          this.dispatchEvent(new Event("loadend"));
        }, 3000);
      }
    }
    Object.defineProperty(window, "XMLHttpRequest", { value: MockUploadRequest });
  });
  await page.goto("/?tab=upload");
  await page.locator('input[type="file"]').setInputFiles({
    name: "speed-test.mp4", mimeType: "video/mp4", buffer: Buffer.from("test"),
  });
  await page.getByRole("button", { name: "上传视频", exact: true }).click();
  await expect(page.getByText(/上传速度 [1-9][\d.]*KB\/s/)).toBeVisible();
  await expect(page.getByText(/上传速度 0KB\/s/)).toBeVisible();
  await expect(page.getByText("文件已传完，正在保存记录…")).toBeVisible();
  await expect(page.getByText(/上传速度/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "上传视频", exact: true })).toBeVisible();
});
