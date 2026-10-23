"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ApiResponse, DownloadTask, HistoryItem, VideoInfo } from "@/lib/types";

type Phase = "idle" | "parsing" | "ready" | "starting" | "downloading" | "done" | "error";
type Tab = "downloader" | "history";

export default function Home() {
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [formatId, setFormatId] = useState("");
  const [task, setTask] = useState<DownloadTask | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("downloader");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canDownload = Boolean(video && phase !== "starting" && phase !== "downloading");

  const statusText = useMemo(() => {
    if (phase === "parsing") return "解析中";
    if (phase === "starting") return "创建任务";
    if (phase === "downloading") return "下载中";
    if (phase === "done") return "已完成";
    if (phase === "error") return "失败";
    if (video) return "已解析";
    return "待输入";
  }, [phase, video]);

  useEffect(() => {
    if (!task || (task.status !== "pending" && task.status !== "running")) {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/progress?taskId=${encodeURIComponent(task.id)}`);
      const payload = (await response.json()) as ApiResponse<DownloadTask>;
      if (!payload.ok) {
        setPhase("error");
        setError(payload.error.message);
        window.clearInterval(timer);
        return;
      }

      setTask(payload.data);
      if (payload.data.status === "done") {
        setPhase("done");
        void loadHistory();
        window.clearInterval(timer);
      }
      if (payload.data.status === "failed") {
        setPhase("error");
        setError(payload.data.error || "下载失败");
        window.clearInterval(timer);
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [task]);

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    const syncTabFromUrl = () => {
      const tab = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(tab === "history" ? "history" : "downloader");
    };

    syncTabFromUrl();
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      void loadHistory();
    }
  }, [activeTab]);

  async function handleParse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setVideo(null);
    setTask(null);
    setPhase("parsing");

    const response = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const payload = (await response.json()) as ApiResponse<VideoInfo>;

    if (!payload.ok) {
      setPhase("error");
      setError(payload.error.detail || payload.error.message);
      return;
    }

    setVideo(payload.data);
    setFormatId(payload.data.formats[0]?.id || "");
    setPhase("ready");
  }

  async function handleDownload() {
    if (!video) return;

    setError("");
    setPhase("starting");
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: video.url,
        formatId,
        title: video.title,
        thumbnail: video.thumbnail,
        duration: video.duration,
      }),
    });
    const payload = (await response.json()) as ApiResponse<{ taskId: string; task: DownloadTask }>;

    if (!payload.ok) {
      setPhase("error");
      setError(payload.error.detail || payload.error.message);
      return;
    }

    setTask(payload.data.task);
    setPhase("downloading");
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/history");
      const payload = (await response.json()) as ApiResponse<{ items: HistoryItem[] }>;
      if (payload.ok) {
        setHistory(payload.data.items);
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  function switchTab(nextTab: Tab) {
    setActiveTab(nextTab);
    const nextUrl = new URL(window.location.href);
    if (nextTab === "history") {
      nextUrl.searchParams.set("tab", "history");
    } else {
      nextUrl.searchParams.delete("tab");
    }
    window.history.pushState(null, "", nextUrl);
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-4 text-[var(--color-fg)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-6xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Video Downloader</h1>
            <p className="status-line text-sm text-[var(--color-muted)]">{statusText}</p>
          </div>
          <div className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm tabular-nums text-[var(--color-muted)]">
            {task ? `${Math.round(task.progress)}%` : "0%"}
          </div>
        </header>

        <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-2">
          <TabButton active={activeTab === "downloader"} onClick={() => switchTab("downloader")}>
            下载器
          </TabButton>
          <TabButton active={activeTab === "history"} onClick={() => switchTab("history")}>
            历史记录
          </TabButton>
        </div>

        {activeTab === "downloader" ? (
        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:p-6">
            <form className="flex flex-wrap gap-3" onSubmit={handleParse}>
              <label className="sr-only" htmlFor="video-url">
                视频链接
              </label>
              <input
                id="video-url"
                className="min-h-12 min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-white px-4 text-base outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)]"
                placeholder="https://..."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <button
                className="min-h-12 rounded-md bg-[var(--color-brand)] px-5 font-medium text-white transition hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={phase === "parsing" || !url.trim()}
                type="submit"
              >
                {phase === "parsing" ? "解析中" : "解析"}
              </button>
            </form>

            {error ? (
              <div className="mt-4 rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
                {error}
              </div>
            ) : null}

            {video ? (
              <div className="mt-6 grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="aspect-video overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
                  {video.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      decoding="async"
                      src={video.thumbnail}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-[var(--color-muted)]">
                      No preview
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="[overflow-wrap:anywhere] text-2xl font-semibold leading-tight">
                    {video.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--color-muted)]">
                    <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
                      {video.duration ? formatDuration(video.duration) : "未知时长"}
                    </span>
                    <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
                      {video.formats.length} formats
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="min-w-0">
                      <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">
                        清晰度
                      </span>
                      <select
                        className="h-12 w-full rounded-md border border-[var(--color-border)] bg-white px-3 outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand-soft)]"
                        value={formatId}
                        onChange={(event) => setFormatId(event.target.value)}
                      >
                        {video.formats.map((format) => (
                          <option key={format.id} value={format.id}>
                            {format.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="self-end rounded-md bg-[var(--color-ink)] px-5 py-3 font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canDownload}
                      onClick={handleDownload}
                      type="button"
                    >
                      {phase === "starting" || phase === "downloading" ? "下载中" : "下载"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid min-h-[320px] place-items-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)]">
                Waiting for URL
              </div>
            )}
          </div>

          <aside className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:p-5">
            <h2 className="text-base font-semibold">任务</h2>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--color-track)]">
              <div
                className="h-full rounded-full bg-[var(--color-success)] transition-[width] duration-300"
                style={{ width: `${task ? Math.max(0, Math.min(100, task.progress)) : 0}%` }}
              />
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <TaskRow label="状态" value={task?.status || statusText} />
              <TaskRow label="速度" value={task?.speed || "-"} />
              <TaskRow label="ETA" value={task?.eta || "-"} />
            </dl>

            {task?.status === "done" && task.fileId ? (
              <a
                className="mt-5 flex min-h-12 items-center justify-center rounded-md bg-[var(--color-brand)] px-4 font-medium text-white transition hover:bg-[var(--color-brand-strong)]"
                href={`/api/file/${task.fileId}`}
              >
                保存文件
              </a>
            ) : null}
          </aside>
        </section>
        ) : (
          <section className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">历史记录</h2>
                <p className="status-line text-sm text-[var(--color-muted)]">
                  {historyLoading ? "读取中" : `${history.length} 条记录`}
                </p>
              </div>
              <button
                className="min-h-10 rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-surface)]"
                onClick={() => void loadHistory()}
                type="button"
              >
                刷新
              </button>
            </div>

            {history.length > 0 ? (
              <div className="mt-5 grid gap-3">
                {history.map((item) => (
                  <HistoryRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="mt-5 grid min-h-[320px] place-items-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)]">
                暂无历史记录
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-10 rounded-md px-4 text-sm font-medium transition ${
        active
          ? "bg-[var(--color-ink)] text-white"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const canDownload = item.status === "done" && item.fileId;

  return (
    <article className="grid gap-3 rounded-md border border-[var(--color-border)] bg-white p-3 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center">
      <Thumbnail src={item.thumbnail} />

      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold">{item.title}</h3>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
          <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
            {statusLabel(item.status)}
          </span>
          <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
            {item.duration ? formatDuration(item.duration) : "未知时长"}
          </span>
          <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
            {item.fileSize ? formatBytes(item.fileSize) : item.source === "recovered" ? "本地文件" : "-"}
          </span>
          <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
            {new Date(item.updatedAt).toLocaleString()}
          </span>
        </div>
        {item.url ? (
          <p className="mt-2 truncate text-xs text-[var(--color-muted)]">{item.url}</p>
        ) : null}
        {item.error ? (
          <p className="mt-2 [overflow-wrap:anywhere] text-xs text-[var(--color-danger)]">{item.error}</p>
        ) : null}
      </div>

      {canDownload ? (
        <a
          className="flex min-h-10 items-center justify-center rounded-md bg-[var(--color-brand)] px-4 text-sm font-medium text-white transition hover:bg-[var(--color-brand-strong)]"
          href={`/api/file/${item.fileId}`}
        >
          下载
        </a>
      ) : (
        <span className="text-right text-sm text-[var(--color-muted)]">{Math.round(item.progress)}%</span>
      )}
    </article>
  );
}

function Thumbnail({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);

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

function TaskRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="truncate text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function statusLabel(status: DownloadTask["status"]): string {
  const labels: Record<DownloadTask["status"], string> = {
    pending: "排队中",
    running: "下载中",
    done: "已完成",
    failed: "失败",
  };
  return labels[status];
}
