"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ApiResponse, HistoryItem, RecordStatus } from "@/lib/types";

type ActiveTab = "download" | "upload";

type HomeProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function Home({ searchParams }: HomeProps) {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [uploadItems, setUploadItems] = useState<HistoryItem[]>([]);
  const uploadListRevision = useRef(0);
  const [formatById, setFormatById] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    () => (searchParams?.tab === "upload" ? "upload" : "download"),
  );
  const [loading, setLoading] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [playingItem, setPlayingItem] = useState<HistoryItem | null>(null);

  const activeCount = useMemo(
    () => items.filter((item) => ["parsing", "pending", "running"].includes(item.status)).length,
    [items],
  );

  const statusText = useMemo(() => {
    if (activeTab === "upload") {
      if (uploadLoading) return "读取上传视频";
      return `${uploadItems.length} 个上传视频`;
    }
    if (loading) return "读取下载任务";
    if (activeCount > 0) return `${activeCount} 个下载任务运行中`;
    return `${items.length} 个下载任务`;
  }, [activeCount, activeTab, items.length, loading, uploadItems.length, uploadLoading]);

  useEffect(() => {
    void loadTasks();
    void loadUploads();
  }, []);

  useEffect(() => {
    const syncActiveTabFromUrl = () => {
      const url = new URL(window.location.href);
      const tab = url.searchParams.get("tab");
      const nextTab: ActiveTab = tab === "upload" ? "upload" : "download";

      if (tab !== nextTab) {
        url.searchParams.set("tab", nextTab);
        window.history.replaceState(window.history.state, "", url);
      }

      setActiveTab(nextTab);
    };

    syncActiveTabFromUrl();
    window.addEventListener("popstate", syncActiveTabFromUrl);
    return () => window.removeEventListener("popstate", syncActiveTabFromUrl);
  }, []);

  function selectTab(tab: ActiveTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === tab) {
      return;
    }
    url.searchParams.set("tab", tab);
    window.history.pushState(window.history.state, "", url);
  }

  useEffect(() => {
    if (activeCount === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadTasks();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeCount]);

  async function loadTasks() {
    setLoading(true);
    try {
      const response = await fetch("/api/tasks");
      const payload = (await response.json()) as ApiResponse<{ items: HistoryItem[] }>;
      if (payload.ok) {
        setItems(payload.data.items);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadUploads() {
    const requestRevision = uploadListRevision.current;
    setUploadLoading(true);
    try {
      const response = await fetch("/api/uploads");
      const payload = (await response.json()) as ApiResponse<{ items: HistoryItem[] }>;
      if (!response.ok || !payload.ok) {
        setUploadError(payload.ok ? "读取上传列表失败" : payload.error.detail || payload.error.message);
        return;
      }
      if (requestRevision === uploadListRevision.current) {
        setUploadItems(payload.data.items);
      }
    } catch (listFailure) {
      setUploadError(listFailure instanceof Error ? listFailure.message : "读取上传列表失败");
    } finally {
      setUploadLoading(false);
    }
  }

  async function refreshCurrentTab() {
    if (activeTab === "upload") {
      await loadUploads();
      return;
    }
    await loadTasks();
  }

  async function handleCreateTasks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const response = await fetch("/api/tasks/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: input }),
    });
    const payload = (await response.json()) as ApiResponse<{ items: HistoryItem[] }>;

    setSubmitting(false);
    if (!payload.ok) {
      setError(payload.error.detail || payload.error.message);
      return;
    }

    setInput("");
    await loadTasks();
  }

  async function handleDownload(item: HistoryItem) {
    setError("");
    const formatId = formatById[item.id] || item.formatId || item.formats?.[0]?.id || "";
    const response = await fetch(`/api/tasks/${item.id}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId }),
    });
    const payload = (await response.json()) as ApiResponse<unknown>;
    if (!payload.ok) {
      setError(payload.error.detail || payload.error.message);
      return;
    }
    await loadTasks();
  }

  async function handleRetryParse(item: HistoryItem) {
    setError("");
    const response = await fetch(`/api/tasks/${item.id}`, { method: "POST" });
    const payload = (await response.json()) as ApiResponse<unknown>;
    if (!payload.ok) {
      setError(payload.error.detail || payload.error.message);
      return;
    }
    await loadTasks();
  }

  async function handleDelete(item: HistoryItem) {
    const confirmed = window.confirm(
      item.fileId ? "删除后会同时移除本地视频文件，确认删除？" : "确认删除这条任务？",
    );
    if (!confirmed) {
      return;
    }

    setError("");
    const response = await fetch(`/api/tasks/${item.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as ApiResponse<unknown>;
    if (!payload.ok) {
      setError(payload.error.detail || payload.error.message);
      return;
    }
    await loadTasks();
  }

  function handleUploadFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setUploadError("");
    setUploadFiles(Array.from(event.target.files || []));
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setUploadError("");
    if (uploadFiles.length === 0) {
      setUploadError("请选择要上传的视频文件");
      return;
    }

    setUploadSubmitting(true);
    setUploadProgress(0);
    const formData = new FormData();
    uploadFiles.forEach((file) => formData.append("videos", file));

    try {
      const payload = await new Promise<ApiResponse<{ items: HistoryItem[] }>>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/uploads");
        request.upload.addEventListener("progress", (progressEvent) => {
          if (progressEvent.lengthComputable) {
            setUploadProgress(Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100)));
          }
        });
        request.addEventListener("load", () => {
          let responsePayload: ApiResponse<{ items: HistoryItem[] }>;
          try {
            responsePayload = JSON.parse(request.responseText) as ApiResponse<{ items: HistoryItem[] }>;
          } catch {
            reject(new Error("服务器返回了无法识别的响应"));
            return;
          }
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(responsePayload.ok ? `上传失败（${request.status}）` : responsePayload.error.detail || responsePayload.error.message));
            return;
          }
          resolve(responsePayload);
        });
        request.addEventListener("error", () => reject(new Error("网络连接中断，上传未完成")));
        request.addEventListener("abort", () => reject(new Error("上传已取消")));
        request.send(formData);
      });

      if (!payload.ok) {
        setUploadError(payload.error.detail || payload.error.message);
        uploadListRevision.current += 1;
        void loadUploads();
        return;
      }

      uploadListRevision.current += 1;
      setUploadItems((current) => {
        const uploadedIds = new Set(payload.data.items.map((item) => item.id));
        return [...payload.data.items, ...current.filter((item) => !uploadedIds.has(item.id))]
          .sort((a, b) => b.updatedAt - a.updatedAt);
      });
      setUploadFiles([]);
      form.reset();
      setUploadProgress(100);
      void loadUploads();
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : "上传视频失败，请重试");
      uploadListRevision.current += 1;
      void loadUploads();
    } finally {
      setUploadSubmitting(false);
    }
  }

  async function handleDeleteUpload(item: HistoryItem) {
    const confirmed = window.confirm("删除后会同时移除本地上传视频文件，确认删除？");
    if (!confirmed) {
      return;
    }

    setUploadError("");
    const response = await fetch(`/api/uploads/${item.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as ApiResponse<unknown>;
    if (!payload.ok) {
      setUploadError(payload.error.detail || payload.error.message);
      return;
    }
    uploadListRevision.current += 1;
    setUploadItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    await loadUploads();
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-4 text-[var(--color-fg)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-6xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Video Downloader</h1>
            <p className="status-line text-sm text-[var(--color-muted)]">{statusText}</p>
          </div>
          <button
            className="min-h-10 rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-panel)]"
            onClick={() => void refreshCurrentTab()}
            type="button"
          >
            刷新
          </button>
        </header>

        <nav
          aria-label="页面功能"
          className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 sm:gap-3 sm:p-3"
        >
          <TabButton
            active={activeTab === "download"}
            count={items.length}
            label="视频下载"
            onClick={() => selectTab("download")}
          />
          <TabButton
            active={activeTab === "upload"}
            count={uploadItems.length}
            label="视频上传"
            onClick={() => selectTab("upload")}
          />
        </nav>

        {activeTab === "download" ? (
          <>
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:p-6">
              <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleCreateTasks}>
                <label className="min-w-0">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">
                    视频链接
                  </span>
                  <textarea
                    className="min-h-28 w-full resize-y rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)]"
                    placeholder="每行一个链接，也可以只填一个链接"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                  />
                </label>
                <button
                  className="self-center rounded-md bg-[var(--color-brand)] px-5 py-3 font-medium text-white transition hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={submitting || !input.trim()}
                  type="submit"
                >
                  {submitting ? "创建中" : "创建解析任务"}
                </button>
              </form>

              {error ? (
                <div className="mt-4 rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
                  {error}
                </div>
              ) : null}
            </section>

            <section className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:p-6">
              <ListHeader loading={loading} title="下载列表" total={items.length} />

              {items.length > 0 ? (
                <div className="mt-5 grid gap-3">
                  {items.map((item) => (
                    <TaskCard
                      key={item.id}
                      item={item}
                      selectedFormat={formatById[item.id] || item.formatId || item.formats?.[0]?.id || ""}
                      onDownload={() => void handleDownload(item)}
                      onFormatChange={(formatId) =>
                        setFormatById((current) => ({ ...current, [item.id]: formatId }))
                      }
                      onRetryParse={() => void handleRetryParse(item)}
                      onDelete={() => void handleDelete(item)}
                      onPlay={() => setPlayingItem(item)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyList label="暂无下载任务" />
              )}
            </section>
          </>
        ) : (
          <>
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:p-6">
              <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleUpload}>
                <label className="min-w-0">
                  <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">
                    本地视频
                  </span>
                  <input
                    accept="video/*,.mp4,.mkv,.webm,.mov,.m4v"
                    disabled={uploadSubmitting}
                    className="block w-full rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none transition file:mr-4 file:rounded-md file:border-0 file:bg-[var(--color-ink)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)]"
                    multiple
                    onChange={handleUploadFilesChange}
                    type="file"
                  />
                  {uploadSubmitting ? (
                    <div className="mt-3" aria-live="polite">
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
                        <span>{uploadProgress >= 100 ? "文件已传完，正在保存记录…" : "正在上传视频…"}</span>
                        <span className="tabular-nums">{uploadProgress}%</span>
                      </div>
                      <div
                        aria-label="上传进度"
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={uploadProgress}
                        className="h-2 overflow-hidden rounded-full bg-[var(--color-track)]"
                        role="progressbar"
                      >
                        <div
                          className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="status-line mt-2 text-sm text-[var(--color-muted)]">
                      {uploadFiles.length > 0
                        ? `${uploadFiles.length} 个文件待上传`
                        : "支持 mp4、mkv、webm、mov、m4v"}
                    </p>
                  )}
                </label>
                <button
                  className="self-center rounded-md bg-[var(--color-brand)] px-5 py-3 font-medium text-white transition hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={uploadSubmitting || uploadFiles.length === 0}
                  type="submit"
                >
                  {uploadSubmitting ? "上传中" : "上传视频"}
                </button>
              </form>

              {uploadError ? (
                <div className="mt-4 rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
                  {uploadError}
                </div>
              ) : null}
            </section>

            <section className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:p-6">
              <ListHeader loading={uploadLoading} title="上传列表" total={uploadItems.length} />

              {uploadItems.length > 0 ? (
                <div className="mt-5 grid gap-3">
                  {uploadItems.map((item) => (
                    <TaskCard
                      key={item.id}
                      item={item}
                      selectedFormat=""
                      onDownload={() => undefined}
                      onFormatChange={() => undefined}
                      onRetryParse={() => undefined}
                      onDelete={() => void handleDeleteUpload(item)}
                      onPlay={() => setPlayingItem(item)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyList label="暂无上传视频" />
              )}
            </section>
          </>
        )}
        {playingItem?.fileId ? (
          <PlayerDialog item={playingItem} onClose={() => setPlayingItem(null)} />
        ) : null}
      </div>
    </main>
  );
}

function TabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`flex min-h-14 w-full items-center justify-center rounded-lg px-4 py-3 text-base font-semibold transition sm:min-h-16 sm:text-lg ${
        active
          ? "bg-[var(--color-ink)] text-white shadow-sm"
          : "text-[var(--color-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className="ml-2 tabular-nums">{count}</span>
    </button>
  );
}

function ListHeader({ loading, title, total }: { loading: boolean; title: string; total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="status-line text-sm text-[var(--color-muted)]">
          {loading ? "读取中" : `${total} 条记录`}
        </p>
      </div>
    </div>
  );
}

function EmptyList({ label }: { label: string }) {
  return (
    <div className="mt-5 grid min-h-[320px] place-items-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)]">
      {label}
    </div>
  );
}

function TaskCard({
  item,
  selectedFormat,
  onDownload,
  onFormatChange,
  onRetryParse,
  onDelete,
  onPlay,
}: {
  item: HistoryItem;
  selectedFormat: string;
  onDownload: () => void;
  onFormatChange: (formatId: string) => void;
  onRetryParse: () => void;
  onDelete: () => void;
  onPlay: () => void;
}) {
  const canChooseFormat = item.status === "parsed" && item.formats && item.formats.length > 0;
  const canDownload = item.status === "parsed" || item.status === "failed";
  const isActive = item.status === "parsing" || item.status === "pending" || item.status === "running";

  return (
    <article className="grid gap-3 rounded-md border border-[var(--color-border)] bg-white p-3 lg:grid-cols-[140px_minmax(0,1fr)_220px] lg:items-start">
      <Thumbnail src={item.thumbnail} />

      <div className="min-w-0">
        <h3 className="line-clamp-2 min-w-0 [overflow-wrap:anywhere] text-base font-semibold leading-6">
          {item.title}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
          <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
            {statusLabel(item.status)}
          </span>
          <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
            {item.duration ? formatDuration(item.duration) : "未知时长"}
          </span>
          <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
            {item.fileSize ? formatBytes(item.fileSize) : item.formats ? `${item.formats.length} formats` : "-"}
          </span>
          <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
            {new Date(item.updatedAt).toLocaleString()}
          </span>
        </div>
        {item.url ? <p className="mt-2 truncate text-xs text-[var(--color-muted)]">{item.url}</p> : null}
        {item.error ? (
          <p className="mt-2 [overflow-wrap:anywhere] text-xs text-[var(--color-danger)]">{item.error}</p>
        ) : null}
        {isActive ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-track)]">
            <div
              className="h-full rounded-full bg-[var(--color-success)] transition-[width] duration-300"
              style={{ width: `${Math.max(6, Math.min(100, item.progress || 8))}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-2 lg:w-[220px]">
        {canChooseFormat ? (
          <select
            className="h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)]"
            value={selectedFormat}
            onChange={(event) => onFormatChange(event.target.value)}
          >
            {item.formats?.map((format) => (
              <option key={format.id} value={format.id}>
                {format.label}
              </option>
            ))}
          </select>
        ) : null}

        {item.status === "done" && item.fileId ? (
          <>
            <button
              className="min-h-10 rounded-md bg-[var(--color-ink)] px-4 text-sm font-medium text-white transition hover:bg-black"
              onClick={onPlay}
              type="button"
            >
              播放
            </button>
            <a
              className="flex min-h-10 items-center justify-center rounded-md bg-[var(--color-brand)] px-4 text-sm font-medium text-white transition hover:bg-[var(--color-brand-strong)]"
              href={`/api/file/${item.fileId}`}
            >
              下载文件
            </a>
          </>
        ) : canDownload ? (
          <button
            className="min-h-10 rounded-md bg-[var(--color-ink)] px-4 text-sm font-medium text-white transition hover:bg-black"
            onClick={onDownload}
            type="button"
          >
            加入下载队列
          </button>
        ) : item.status === "parse_failed" ? (
          <button
            className="min-h-10 rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-surface)]"
            onClick={onRetryParse}
            type="button"
          >
            重新解析
          </button>
        ) : (
          <span className="text-right text-sm text-[var(--color-muted)]">{Math.round(item.progress)}%</span>
        )}
        <button
          className="min-h-10 rounded-md border border-[var(--color-danger-border)] px-4 text-sm font-medium text-[var(--color-danger)] transition hover:bg-[var(--color-danger-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isActive}
          onClick={onDelete}
          type="button"
        >
          删除
        </button>
      </div>
    </article>
  );
}

function PlayerDialog({ item, onClose }: { item: HistoryItem; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!item.fileId) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="min-w-0 truncate text-base font-semibold">{item.title}</h2>
          <button
            className="min-h-10 rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-surface)]"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>
        <div className="bg-black">
          <video
            autoPlay
            className="max-h-[75vh] w-full"
            controls
            playsInline
            poster={item.thumbnail}
            src={`/api/stream/${item.fileId}`}
          />
        </div>
      </div>
    </div>
  );
}

function Thumbnail({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="aspect-video overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid h-full place-items-center text-xs text-[var(--color-muted)]">Video</div>
      </div>
    );
  }

  return (
    <div className="aspect-video overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className="h-full w-full object-cover"
        decoding="async"
        loading="lazy"
        onError={() => setFailed(true)}
        src={src}
      />
    </div>
  );
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const rest = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function statusLabel(status: RecordStatus): string {
  const labels: Record<RecordStatus, string> = {
    created: "已创建",
    parsing: "解析中",
    parsed: "已解析",
    parse_failed: "解析失败",
    pending: "排队中",
    running: "下载中",
    done: "已完成",
    failed: "下载失败",
  };
  return labels[status];
}
