"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ApiResponse, HistoryItem, RecordStatus } from "@/lib/types";

export default function Home() {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [formatById, setFormatById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const activeCount = useMemo(
    () => items.filter((item) => ["parsing", "pending", "running"].includes(item.status)).length,
    [items],
  );

  const statusText = useMemo(() => {
    if (loading) return "读取任务";
    if (activeCount > 0) return `${activeCount} 个任务运行中`;
    return `${items.length} 个任务`;
  }, [activeCount, items.length, loading]);

  useEffect(() => {
    void loadTasks();
  }, []);

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
    if (!item.url) return;
    setError("");
    const response = await fetch("/api/tasks/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: item.url }),
    });
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
            onClick={() => void loadTasks()}
            type="button"
          >
            刷新
          </button>
        </header>

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
              className="self-end rounded-md bg-[var(--color-brand)] px-5 py-3 font-medium text-white transition hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">任务列表</h2>
              <p className="status-line text-sm text-[var(--color-muted)]">
                {loading ? "读取中" : `${items.length} 条记录`}
              </p>
            </div>
          </div>

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
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 grid min-h-[320px] place-items-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)]">
              暂无任务
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function TaskCard({
  item,
  selectedFormat,
  onDownload,
  onFormatChange,
  onRetryParse,
  onDelete,
}: {
  item: HistoryItem;
  selectedFormat: string;
  onDownload: () => void;
  onFormatChange: (formatId: string) => void;
  onRetryParse: () => void;
  onDelete: () => void;
}) {
  const canChooseFormat = item.status === "parsed" && item.formats && item.formats.length > 0;
  const canDownload = item.status === "parsed" || item.status === "failed";
  const isActive = item.status === "parsing" || item.status === "pending" || item.status === "running";

  return (
    <article className="grid gap-3 rounded-md border border-[var(--color-border)] bg-white p-3 lg:grid-cols-[140px_minmax(0,1fr)_220px] lg:items-center">
      <Thumbnail src={item.thumbnail} />

      <div className="min-w-0">
        <h3 className="[overflow-wrap:anywhere] text-base font-semibold">{item.title}</h3>
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

      <div className="grid gap-2">
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
          <a
            className="flex min-h-10 items-center justify-center rounded-md bg-[var(--color-brand)] px-4 text-sm font-medium text-white transition hover:bg-[var(--color-brand-strong)]"
            href={`/api/file/${item.fileId}`}
          >
            下载文件
          </a>
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
