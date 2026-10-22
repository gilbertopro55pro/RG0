import { useSyncExternalStore } from "react";
import { pdfBandedPct } from "@/lib/pdfBandedPct";
import { setBusyLabel } from "@/lib/updateResume";
import type { Lang } from "@/i18n/config";

// Album exports (PDF, JPG, PSD) that keep going in the background (owner, 2026-10-22: "ייצוא PDF
// מתבצע ללא אפשרות של פעולה ברקע"). The server already renders the job on its own and emails the
// link when it's ready; this store is the tab's side of it, kept outside any screen so it survives
// moving around the app: it creates the job, follows it, and holds the finished file for the
// download card. The progress window, the floating pill and the card are AlbumExportsLayer (in the
// layout), so the gallery's album tool and the home quick export both just call startAlbumExport.
// One export at a time per photographer (the server's rule, findActiveExportJob): starting another
// while one runs brings the running one back to the front.

export type AlbumExportFormat = "pdf" | "jpg" | "psd";

export const ALBUM_EXPORT_LABEL: Record<AlbumExportFormat, string> = { pdf: "ייצוא PDF", jpg: "ייצוא JPG", psd: "ייצוא PSD" };
const ROUTE: Record<AlbumExportFormat, string> = { pdf: "export-pdf", jpg: "export-jpg", psd: "export-psd" };
const MIME: Record<AlbumExportFormat, string> = { pdf: "application/pdf", jpg: "application/zip", psd: "application/zip" };
const FALLBACK_NAME: Record<AlbumExportFormat, string> = { pdf: "album.pdf", jpg: "album-jpg.zip", psd: "album-psd.zip" };

export type AlbumExport = {
  id: string;
  // Null until the server created the job.
  jobId: string | null;
  // The job's gallery: an export already running from another screen or device can be another
  // gallery's (the server answers with that one), and then its title isn't known here.
  galleryId: string;
  galleryTitle: string | null;
  format: AlbumExportFormat;
  phase: "running" | "ready" | "failed";
  // The PDF server is catching up after a deploy (the route answers 503 for up to ~2 minutes).
  waitingForServer: boolean;
  // The server answered with an export that was already running.
  alreadyActive: boolean;
  pct: number;
  // Hidden from the progress window: the floating pill shows it, and the card when it's done.
  background: boolean;
  downloadUrl: string | null;
  // When downloadUrl was signed (it's good for an hour).
  readyAt: number | null;
  filename: string;
  mimeType: string;
  // PDF from the album tool: lets the photographer pick the folder (downloadBlob).
  allowSaveDialog: boolean;
  error: string | null;
  // For "שיתוף בוואטסאפ" on the card.
  clientPhone: string | null;
  clientLang: Lang;
  startedAt: number;
};

export type StartAlbumExport = {
  galleryId: string;
  galleryTitle: string | null;
  format: AlbumExportFormat;
  from: number;
  to: number;
  allowSaveDialog?: boolean;
  clientPhone?: string | null;
  clientLang?: Lang;
};

type JobStatus = {
  status: string;
  processedCount: number;
  totalCount: number;
  qualityStepIndex: number;
  errorMessage: string | null;
  downloadUrl: string | null;
  filename: string | null;
};

const STORAGE_KEY = "gf_album_exports";
const STORED_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const POLL_MS = 1200;
const WORKER_WAIT_MS = 120_000;
const WORKER_POLL_MS = 4_000;
// Polls in a row that may fail (offline, a cold start) before giving up on following the job. The
// job itself keeps going on the server, and its link arrives by email.
const MAX_POLL_FAILURES = 8;
export const FOLLOW_LOST_ERROR = "לא הצלחנו לבדוק את התקדמות הייצוא. כשהקובץ יהיה מוכן, יישלח אליכם קישור במייל";
const EXPORT_ERROR = "שגיאה בייצוא הקבצים";

let exports: AlbumExport[] = [];
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();
let resumed = false;
let seq = 0;

function emit() {
  listeners.forEach((l) => l());
  persist();
  setBusyLabel("album-export", exports.some(isAlbumExportRunning) ? "ייצוא האלבום" : null);
}

function patch(id: string, p: Partial<AlbumExport>) {
  if (!exports.some((e) => e.id === id)) return;
  exports = exports.map((e) => (e.id === id ? { ...e, ...p } : e));
  emit();
}

function remove(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  if (!exports.some((e) => e.id === id)) return;
  exports = exports.filter((e) => e.id !== id);
  emit();
}

function get(id: string): AlbumExport | undefined {
  return exports.find((e) => e.id === id);
}

export function isAlbumExportRunning(e: AlbumExport | null | undefined): boolean {
  return e?.phase === "running";
}

export function runningAlbumExport(): AlbumExport | undefined {
  return exports.find(isAlbumExportRunning);
}

export function getAlbumExports(): AlbumExport[] {
  return exports;
}

export function subscribeAlbumExports(listener: () => void): () => void {
  resumeStored();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: AlbumExport[] = [];

export function useAlbumExports(): AlbumExport[] {
  return useSyncExternalStore(subscribeAlbumExports, getAlbumExports, () => EMPTY);
}

// Starts an export, or brings the one already running to the front.
export function startAlbumExport(input: StartAlbumExport): AlbumExport {
  const running = runningAlbumExport();
  if (running) {
    patch(running.id, { background: false });
    return get(running.id)!;
  }
  // A finished export's card gives way to the new one.
  exports.filter((e) => !isAlbumExportRunning(e)).forEach((e) => remove(e.id));
  const id = `export-${Date.now()}-${++seq}`;
  const task: AlbumExport = {
    id,
    jobId: null,
    galleryId: input.galleryId,
    galleryTitle: input.galleryTitle,
    format: input.format,
    phase: "running",
    waitingForServer: false,
    alreadyActive: false,
    pct: 0,
    background: false,
    downloadUrl: null,
    readyAt: null,
    filename: FALLBACK_NAME[input.format],
    mimeType: MIME[input.format],
    allowSaveDialog: !!input.allowSaveDialog,
    error: null,
    clientPhone: input.clientPhone ?? null,
    clientLang: input.clientLang ?? "he",
    startedAt: Date.now(),
  };
  exports = [...exports, task];
  emit();
  void create(id, { from: input.from, to: input.to, quality: "web" });
  return task;
}

export function sendAlbumExportToBackground(id: string) {
  patch(id, { background: true });
}

export function showAlbumExport(id: string) {
  patch(id, { background: false });
}

// Stops the job on the server too (export-jobs DELETE), so it doesn't keep rendering for nobody.
export function cancelAlbumExport(id: string) {
  const task = get(id);
  if (task?.jobId && isAlbumExportRunning(task)) {
    fetch(`/api/galleries/${task.galleryId}/album/export-jobs/${task.jobId}`, { method: "DELETE", keepalive: true }).catch(() => {});
  }
  remove(id);
}

export function dismissAlbumExport(id: string) {
  remove(id);
}

function fail(id: string, error: string) {
  controllers.delete(id);
  patch(id, { phase: "failed", error, waitingForServer: false });
}

// Resolves after `ms`, or as soon as the export is cancelled.
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function create(id: string, body: { from: number; to: number; quality: "web" }) {
  const task = get(id);
  if (!task) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  const { signal } = controller;
  const deadline = Date.now() + WORKER_WAIT_MS;
  try {
    while (true) {
      const res = await fetch(`/api/galleries/${task.galleryId}/album/${ROUTE[task.format]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const data = (await res.json().catch(() => null)) as {
        jobId?: string;
        alreadyActive?: boolean;
        format?: AlbumExportFormat;
        galleryId?: string;
        error?: string;
      } | null;
      if (signal.aborted) return;
      if (res.ok && data?.jobId) {
        const galleryId = data.galleryId ?? task.galleryId;
        const format = data.format ?? task.format;
        patch(id, {
          jobId: data.jobId,
          waitingForServer: false,
          alreadyActive: !!data.alreadyActive,
          galleryId,
          galleryTitle: galleryId === task.galleryId ? task.galleryTitle : null,
          format,
          filename: FALLBACK_NAME[format],
          mimeType: MIME[format],
          allowSaveDialog: task.allowSaveDialog && format === "pdf",
        });
        break;
      }
      // The PDF server hasn't caught up with a fresh deploy yet (checkRenderWorkerHealth): wait
      // quietly, "מכינים את השרת", instead of failing on the first click.
      if (task.format === "pdf" && res.status === 503 && Date.now() < deadline) {
        patch(id, { waitingForServer: true });
        await sleep(WORKER_POLL_MS, signal);
        if (signal.aborted) return;
        continue;
      }
      fail(id, data?.error ?? EXPORT_ERROR);
      return;
    }
  } catch {
    if (!signal.aborted) fail(id, EXPORT_ERROR);
    return;
  }
  await follow(id, signal);
}

async function follow(id: string, signal: AbortSignal) {
  let failures = 0;
  while (!signal.aborted) {
    const task = get(id);
    if (!task?.jobId) return;
    let data: JobStatus | null = null;
    try {
      const res = await fetch(`/api/galleries/${task.galleryId}/album/export-jobs/${task.jobId}`, { signal });
      if (res.status === 404) {
        fail(id, EXPORT_ERROR);
        return;
      }
      if (res.ok) data = (await res.json()) as JobStatus;
    } catch {
      if (signal.aborted) return;
    }
    if (signal.aborted) return;
    if (!data) {
      if (++failures >= MAX_POLL_FAILURES) {
        fail(id, FOLLOW_LOST_ERROR);
        return;
      }
      await sleep(1500, signal);
      continue;
    }
    failures = 0;
    const pct = exportPct(task.format, data);
    if (data.status === "ready") {
      if (!data.downloadUrl) {
        fail(id, EXPORT_ERROR);
        return;
      }
      controllers.delete(id);
      patch(id, { phase: "ready", pct: 100, downloadUrl: data.downloadUrl, readyAt: Date.now(), filename: data.filename ?? task.filename });
      return;
    }
    if (data.status === "failed") {
      fail(id, data.errorMessage ?? EXPORT_ERROR);
      return;
    }
    // Cancelled elsewhere (another tab, the other device).
    if (data.status === "cancelled") {
      remove(id);
      return;
    }
    if (pct !== task.pct) patch(id, { pct });
    await sleep(POLL_MS, signal);
  }
}

// Unrounded: the progress window shows two decimals. A PDF's quality-step retries map into bands,
// so the number never falls back to 0% (pdfBandedPct).
export function exportPct(format: AlbumExportFormat, data: Pick<JobStatus, "processedCount" | "totalCount" | "qualityStepIndex">): number {
  if (format === "pdf") return pdfBandedPct(data.qualityStepIndex, data.processedCount, data.totalCount);
  return data.totalCount > 0 ? (data.processedCount / data.totalCount) * 100 : 0;
}

// A fresh signed link for the card's download button when the one from the poll is close to its
// hour.
export async function freshDownloadUrl(task: AlbumExport): Promise<string | null> {
  if (task.downloadUrl && task.readyAt && Date.now() - task.readyAt < 50 * 60 * 1000) return task.downloadUrl;
  if (!task.jobId) return null;
  const res = await fetch(`/api/galleries/${task.galleryId}/album/export-jobs/${task.jobId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as JobStatus;
  if (!data.downloadUrl) return null;
  patch(task.id, { downloadUrl: data.downloadUrl, readyAt: Date.now() });
  return data.downloadUrl;
}

// --- surviving a reload ---
// A refresh (or the "יש עדכון חדש" reload) mid-export picks the job back up, in the background.

type Stored = Pick<AlbumExport, "id" | "jobId" | "galleryId" | "galleryTitle" | "format" | "allowSaveDialog" | "clientPhone" | "clientLang" | "startedAt">;

function persist() {
  if (typeof window === "undefined") return;
  const stored: Stored[] = exports
    .filter((e) => e.jobId && e.phase !== "failed")
    .map(({ id, jobId, galleryId, galleryTitle, format, allowSaveDialog, clientPhone, clientLang, startedAt }) => ({
      id,
      jobId,
      galleryId,
      galleryTitle,
      format,
      allowSaveDialog,
      clientPhone,
      clientLang,
      startedAt,
    }));
  try {
    if (stored.length > 0) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or full storage: a reload just loses the pill; the email still comes.
  }
}

export function parseStoredExports(raw: string | null, now: number): Stored[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Stored[];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.jobId === "string" &&
        typeof s.galleryId === "string" &&
        (s.format === "pdf" || s.format === "jpg" || s.format === "psd") &&
        typeof s.startedAt === "number" &&
        now - s.startedAt < STORED_MAX_AGE_MS
    );
  } catch {
    return [];
  }
}

function resumeStored() {
  if (resumed || typeof window === "undefined") return;
  resumed = true;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  const stored = parseStoredExports(raw, Date.now()).filter((s) => !exports.some((e) => e.jobId === s.jobId));
  if (stored.length === 0) return;
  exports = [
    ...exports,
    ...stored.map(
      (s): AlbumExport => ({
        ...s,
        phase: "running",
        waitingForServer: false,
        alreadyActive: false,
        pct: 0,
        background: true,
        downloadUrl: null,
        readyAt: null,
        filename: FALLBACK_NAME[s.format],
        mimeType: MIME[s.format],
        error: null,
        clientPhone: s.clientPhone ?? null,
        clientLang: s.clientLang ?? "he",
        galleryTitle: s.galleryTitle ?? null,
      })
    ),
  ];
  emit();
  for (const s of stored) {
    const controller = new AbortController();
    controllers.set(s.id, controller);
    void follow(s.id, controller.signal);
  }
}

// Tests only.
export function resetAlbumExportsForTests() {
  controllers.forEach((c) => c.abort());
  controllers.clear();
  exports = [];
  resumed = false;
}
