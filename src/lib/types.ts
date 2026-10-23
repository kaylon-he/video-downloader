export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "YTDLP_NOT_FOUND"
  | "YTDLP_FAILED"
  | "TASK_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "TASK_FAILED"
  | "INTERNAL_ERROR";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  detail?: string;
};

export type VideoFormat = {
  id: string;
  label: string;
  ext?: string;
  resolution?: string;
  height?: number;
  fps?: number;
  filesize?: number;
  hasAudio: boolean;
  hasVideo: boolean;
};

export type VideoInfo = {
  url: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  formats: VideoFormat[];
};

export type DownloadStatus = "pending" | "running" | "done" | "failed";

export type DownloadTask = {
  id: string;
  url: string;
  formatId?: string;
  status: DownloadStatus;
  progress: number;
  speed?: string;
  eta?: string;
  filename?: string;
  fileId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type DownloadRequest = {
  url?: unknown;
  formatId?: unknown;
};

export type ParseRequest = {
  url?: unknown;
};

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function fail(
  code: ApiErrorCode,
  message: string,
  detail?: string,
): ApiResponse<never> {
  return { ok: false, error: { code, message, detail } };
}
