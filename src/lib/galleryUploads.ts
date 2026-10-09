import { useSyncExternalStore } from "react";
import { convertHeicIfNeeded, isHeicFile, putFileWithProgress } from "@/lib/imageUpload";
import { createClient } from "@/lib/supabase/client";
import { readActiveUploadLock, writeActiveUploadLock, ACTIVE_UPLOAD_STORAGE_KEY, type ActiveUploadLock } from "@/lib/activeUploadLock";
import { setBusyLabel } from "@/lib/updateResume";
import type { GalleryPhotoRow } from "@/lib/types";

// Photo uploads that outlive the gallery page (owner, 2026-10-09): start an upload, tap "המשך ברקע",
// start another in a second gallery, and follow them all from the galleries list; each one emails
// and pushes a notification when it's done. Dropping more photos into a gallery that's already
// uploading adds them to that same upload (the total grows), instead of starting a second one.
//
// Uploads are the browser's own requests (straight to storage), so they live as long as this tab
// does: moving around the app is fine, reloading or closing the tab stops them (the page warns
// first). Every gallery shares one pool of parallel transfers, filled in the order the uploads
// were started, so three galleries at once load the photographer's connection (and the servers
// behind each photo) no more than one big upload did. Client-only: imported from client components.

export type UploadPhase = "queued" | "uploading" | "done" | "cancelled" | "offline";

export type GalleryUpload = {
  galleryId: string;
  galleryTitle: string;
  total: number;
  // Files finished, whether they made it or not.
  done: number;
  succeeded: number;
  failed: string[];
  // Overall progress 0–100, counting each file's bytes as they go.
  pct: number;
  phase: UploadPhase;
  // The photographer tapped "המשך ברקע": the gallery page shows a small banner, not the modal.
  background: boolean;
  finishedAt: number | null;
};

type Item = { file: File; folderId: string | null; path: string; contentType: string; sortOrder: number };

type Job = {
  state: GalleryUpload;
  userId: string;
  items: Item[];
  progress: number[];
  next: number;
  sortNext: number;
  hiddenDuring: boolean;
  cancel: boolean;
  urls: Map<number, Promise<string | null>>;
  urlsUpTo: number;
};

const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
const photoListeners = new Map<string, Set<(row: GalleryPhotoRow, file: File) => void>>();
let snapshot: GalleryUpload[] = [];
let workers = 0;
let tabId: string | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let windowHooked = false;

const URL_BATCH = 40;
// A finished upload stays in the list for a moment (the galleries list shows "הועלו ✓"); one with
// failed files stays until its gallery page shows them, or this long at most.
const KEEP_DONE_MS = 20_000;
const KEEP_FAILED_MS = 10 * 60_000;

const concurrency = () => (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches ? 4 : 8);
const isActive = (j: Job) => j.state.phase === "queued" || j.state.phase === "uploading";

export function uploadTabId(): string {
  if (!tabId) tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
  return tabId;
}

// Byte progress arrives many times a second from every transfer; the list redraws at most every
// 150ms for it. Anything else (a file done, an upload added or finished) redraws at once.
let progressTimer: ReturnType<typeof setTimeout> | null = null;
function emitSoon() {
  if (progressTimer) return;
  progressTimer = setTimeout(() => {
    progressTimer = null;
    emit();
  }, 150);
}

function emit() {
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
  snapshot = [...jobs.values()].map((j) => ({ ...j.state, failed: [...j.state.failed] }));
  listeners.forEach((l) => l());
  const active = [...jobs.values()].filter(isActive);
  setBusyLabel("gallery-uploads", active.length > 0 ? "העלאת תמונות" : null);
}

export function subscribeUploads(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUploadsSnapshot(): GalleryUpload[] {
  return snapshot;
}

const EMPTY: GalleryUpload[] = [];
export function getServerUploadsSnapshot(): GalleryUpload[] {
  return EMPTY;
}

// Every upload in this tab, running or just finished, for the galleries list and the floating indicator.
export function useGalleryUploads(): GalleryUpload[] {
  return useSyncExternalStore(subscribeUploads, getUploadsSnapshot, getServerUploadsSnapshot);
}

export function activeUploadCount(galleryId: string): number {
  const j = jobs.get(galleryId);
  return j && isActive(j) ? j.state.total - j.state.done : 0;
}

// The gallery page listens for its new photos while it's open (and the upload counts as watched).
export function onGalleryPhoto(galleryId: string, cb: (row: GalleryPhotoRow, file: File) => void): () => void {
  let set = photoListeners.get(galleryId);
  if (!set) photoListeners.set(galleryId, (set = new Set()));
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) photoListeners.delete(galleryId);
  };
}

export function sendUploadToBackground(galleryId: string) {
  const j = jobs.get(galleryId);
  if (!j) return;
  j.state.background = true;
  emit();
}

export function cancelUpload(galleryId: string) {
  const j = jobs.get(galleryId);
  if (!j || !isActive(j)) return;
  j.cancel = true;
}

export function cancelAllUploads() {
  for (const j of jobs.values()) if (isActive(j)) j.cancel = true;
}

// Removes a finished upload from the list (its result was shown).
export function dismissUpload(galleryId: string) {
  const j = jobs.get(galleryId);
  if (!j || isActive(j)) return;
  jobs.delete(galleryId);
  emit();
}

// Another tab already uploading: that tab's lock, or null when this tab is free to upload.
export function otherTabUpload(): ActiveUploadLock | null {
  const lock = readActiveUploadLock();
  if (!lock) return null;
  return lock.tabId === uploadTabId() ? null : lock;
}

export function enqueueGalleryUpload(input: {
  galleryId: string;
  galleryTitle: string;
  userId: string;
  sortBase: number;
  items: { file: File; folderId: string | null }[];
}): void {
  if (input.items.length === 0) return;
  hookWindow();
  let job = jobs.get(input.galleryId);
  if (!job || !isActive(job)) {
    job = {
      state: {
        galleryId: input.galleryId,
        galleryTitle: input.galleryTitle,
        total: 0,
        done: 0,
        succeeded: 0,
        failed: [],
        pct: 0,
        phase: "queued",
        background: false,
        finishedAt: null,
      },
      userId: input.userId,
      items: [],
      progress: [],
      next: 0,
      sortNext: input.sortBase,
      hiddenDuring: typeof document !== "undefined" && document.hidden,
      cancel: false,
      urls: new Map(),
      urlsUpTo: 0,
    };
    // A new upload for this gallery replaces a finished one still on the list.
    jobs.delete(input.galleryId);
    jobs.set(input.galleryId, job);
  }
  for (const { file, folderId } of input.items) {
    const heic = isHeicFile(file);
    const name = heic ? file.name.replace(/\.(heic|heif)$/i, ".jpg") : file.name;
    job.items.push({
      file,
      folderId,
      path: `${input.userId}/${input.galleryId}/${crypto.randomUUID()}-${name}`,
      contentType: heic ? "image/jpeg" : file.type || "application/octet-stream",
      sortOrder: job.sortNext++,
    });
    job.progress.push(0);
  }
  job.state.total = job.items.length;
  report(job);
  writeLock();
  startHeartbeat();
  while (workers < concurrency()) {
    workers++;
    void worker().finally(() => {
      workers--;
    });
  }
}

function report(job: Job, soon = false) {
  const sum = job.progress.reduce((a, b) => a + b, 0);
  job.state.pct = job.items.length > 0 ? (sum / job.items.length) * 100 : 0;
  if (soon) emitSoon();
  else emit();
}

// The next file to send: from the first upload (in start order) that still has files left.
function takeNext(): { job: Job; i: number } | null {
  for (const job of jobs.values()) {
    if (!isActive(job)) continue;
    if (job.cancel) continue;
    if (job.next < job.items.length) return { job, i: job.next++ };
  }
  return null;
}

function prefetchUrls(job: Job, fromIndex: number) {
  if (job.urlsUpTo > fromIndex + URL_BATCH / 2 || job.urlsUpTo >= job.items.length) return;
  const start = Math.max(job.urlsUpTo, fromIndex);
  const end = Math.min(job.items.length, start + URL_BATCH);
  job.urlsUpTo = end;
  const batch = fetch("/api/storage/upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket: "galleries", items: job.items.slice(start, end).map((it) => ({ path: it.path, contentType: it.contentType })) }),
  })
    .then(async (res) => (res.ok ? ((await res.json()) as { urls?: string[] }).urls ?? null : null))
    .catch(() => null);
  for (let j = start; j < end; j++) job.urls.set(j, batch.then((urls) => urls?.[j - start] ?? null));
}

async function worker() {
  const supabase = createClient();
  while (true) {
    if (typeof navigator !== "undefined" && !navigator.onLine) goOffline();
    // A cancel asked for from another tab (its "ביטול ההעלאה האחרת" button).
    const lock = readActiveUploadLock();
    if (lock?.tabId === uploadTabId() && lock.cancelRequested) cancelAllUploads();
    finishCancelled();
    const nextItem = takeNext();
    if (!nextItem) return;
    const { job, i } = nextItem;
    if (job.state.phase === "queued") {
      job.state.phase = "uploading";
      emit();
    }
    const item = job.items[i];
    let file = item.file;
    let failure: string | null = null;
    let row: GalleryPhotoRow | null = null;
    try {
      if (isHeicFile(file)) {
        try {
          file = await convertHeicIfNeeded(file);
        } catch {
          failure = `${file.name} (המרה נכשלה)`;
        }
      }
      if (!failure) {
        prefetchUrls(job, i);
        let uploaded = false;
        let reason = "שגיאה לא ידועה";
        // A blip on one file in a big batch is likely; a couple of retries make it a non-event.
        for (let attempt = 0; attempt < 3 && !uploaded; attempt++) {
          if (!navigator.onLine) {
            goOffline();
            reason = "אין חיבור לאינטרנט";
            break;
          }
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
          try {
            let url = attempt === 0 ? await (job.urls.get(i) ?? Promise.resolve(null)) : null;
            if (!url) {
              const res = await fetch("/api/storage/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bucket: "galleries", path: item.path, contentType: file.type || "application/octet-stream" }),
              });
              const data = await res.json();
              if (!res.ok || !data.url) {
                reason = data.error ?? reason;
                continue;
              }
              url = data.url as string;
            }
            await putFileWithProgress(url, file, file.type || "application/octet-stream", (fraction) => {
              job.progress[i] = fraction;
              report(job, true);
            });
            uploaded = true;
          } catch (e) {
            reason = e instanceof Error ? e.message : "שגיאת רשת";
          }
        }
        if (!uploaded) {
          failure = job.state.phase === "offline" ? null : `${file.name} (${reason})`;
        } else {
          const { data, error } = await supabase
            .from("gallery_photos")
            .insert({
              gallery_id: job.state.galleryId,
              photographer_id: job.userId,
              storage_path: item.path,
              original_filename: file.name,
              file_size_bytes: file.size,
              sort_order: item.sortOrder,
              folder_id: item.folderId,
            })
            .select()
            .single<GalleryPhotoRow>();
          if (error || !data) failure = `${file.name} (${error?.message ?? "שגיאה בשמירה"})`;
          else row = data;
        }
      }
    } catch (e) {
      failure = `${file.name} (${e instanceof Error ? e.message : "שגיאה לא צפויה"})`;
    }
    job.progress[i] = 1;
    job.state.done++;
    if (row) {
      job.state.succeeded++;
      photoListeners.get(job.state.galleryId)?.forEach((cb) => cb(row!, file));
      // The lightbox preview is made now, so it's ready when the photographer opens the photo.
      fetch(`/api/galleries/${job.state.galleryId}/photos/${row.id}/preview`, { redirect: "manual" }).catch(() => {});
    } else if (failure) {
      job.state.failed.push(failure);
    }
    report(job);
    if (job.state.done >= job.items.length && isActive(job)) finish(job, "done");
  }
}

function goOffline() {
  for (const j of jobs.values()) if (isActive(j)) j.cancel = true;
  for (const j of jobs.values()) if (isActive(j)) finish(j, "offline");
}

// A cancelled upload ends once its files in flight have finished.
function finishCancelled() {
  for (const j of jobs.values()) {
    if (!isActive(j) || !j.cancel) continue;
    const inFlight = j.next - j.state.done;
    if (inFlight <= 0) finish(j, "cancelled");
  }
}

function finish(job: Job, phase: UploadPhase) {
  job.state.phase = phase;
  job.state.finishedAt = Date.now();
  emit();
  writeLock();
  // The photographer gets an email and a phone notification when they weren't watching it end:
  // the upload went to the background, they left the gallery page, or the app was hidden.
  const watched = (photoListeners.get(job.state.galleryId)?.size ?? 0) > 0 && !job.state.background;
  if (phase === "done" && job.state.succeeded > 0 && (!watched || job.hiddenDuring)) {
    fetch(`/api/galleries/${job.state.galleryId}/upload-complete-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ succeededCount: job.state.succeeded, totalCount: job.state.total }),
      keepalive: true,
    }).catch(() => {});
  }
  const keep = job.state.failed.length > 0 ? KEEP_FAILED_MS : KEEP_DONE_MS;
  setTimeout(() => {
    if (jobs.get(job.state.galleryId) === job && !isActive(job)) {
      jobs.delete(job.state.galleryId);
      emit();
    }
  }, keep);
}

// The cross-tab lock (lib/activeUploadLock.ts): another tab sees this one is uploading, and can
// ask it to cancel. Kept fresh by a heartbeat while anything is uploading.
function writeLock() {
  const active = [...jobs.values()].filter(isActive);
  if (active.length === 0) {
    try {
      const raw = localStorage.getItem(ACTIVE_UPLOAD_STORAGE_KEY);
      if (raw && (JSON.parse(raw) as ActiveUploadLock).tabId === uploadTabId()) localStorage.removeItem(ACTIVE_UPLOAD_STORAGE_KEY);
    } catch {}
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    return;
  }
  const first = active[0].state;
  const current = readActiveUploadLock();
  writeActiveUploadLock({
    tabId: uploadTabId(),
    galleryId: first.galleryId,
    galleryTitle: active.length > 1 ? `${first.galleryTitle} +${active.length - 1}` : first.galleryTitle,
    totalCount: active.reduce((a, j) => a + j.state.total, 0),
    doneCount: active.reduce((a, j) => a + j.state.done, 0),
    lastHeartbeat: Date.now(),
    cancelRequested: current?.tabId === uploadTabId() ? current.cancelRequested : false,
  });
}

function startHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(writeLock, 3000);
}

function hookWindow() {
  if (windowHooked || typeof window === "undefined") return;
  windowHooked = true;
  window.addEventListener("offline", goOffline);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    for (const j of jobs.values()) if (isActive(j)) j.hiddenDuring = true;
  });
  // Reloading or closing the tab ends the uploads (the files are only in this page): ask first.
  window.addEventListener("beforeunload", (e) => {
    if (![...jobs.values()].some(isActive)) return;
    e.preventDefault();
    e.returnValue = "";
  });
}
