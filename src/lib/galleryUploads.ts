import { useSyncExternalStore } from "react";
import { convertHeicIfNeeded, isHeicFile, putFileWithProgress } from "@/lib/imageUpload";
import { createClient } from "@/lib/supabase/client";
import { readActiveUploadLock, writeActiveUploadLock, ACTIVE_UPLOAD_STORAGE_KEY, type ActiveUploadLock } from "@/lib/activeUploadLock";
import { setBusyLabel } from "@/lib/updateResume";
import type { GalleryPhotoRow } from "@/lib/types";

// Every upload in the app runs here, outside the screen that started it, so the photographer can
// keep using the app while it goes (owner, 2026-10-09 for gallery photos, 2026-10-10 for all of
// them): gallery photos, photos straight to the portfolio, gallery videos and the album design PDF.
// Start an upload, tap "המשך ברקע" (or just leave the screen), start another one somewhere else,
// and follow them all from the floating indicator (components/UploadsIndicator) and the galleries
// list. Dropping more photos into a gallery that's already uploading adds them to that same upload
// (the total grows), instead of starting a second one.
//
// Uploads are the browser's own requests (straight to storage), so they live as long as this tab
// does: moving around the app is fine, reloading or closing the tab stops them (the page warns
// first). Every upload shares one pool of parallel transfers, so three galleries at once load the
// photographer's connection (and the servers behind each photo) no more than one big upload did.
// Photo uploads take the pool in the order they were started; a video or the album PDF goes ahead
// of them, since it's one or two files someone is waiting on. Client-only: imported from client
// components.

export type UploadPhase = "queued" | "uploading" | "done" | "cancelled" | "offline";

// photos: a gallery's photos. portfolio: photos straight to the portfolio (they live in the
// photographer's hidden portfolio gallery). videos: a gallery's videos. album-pdf: the album design
// PDF on an event's stage.
export type UploadKind = "photos" | "portfolio" | "videos" | "album-pdf";

export type GalleryUpload = {
  // `${kind}:${targetId}`, see uploadKey().
  key: string;
  kind: UploadKind;
  // The gallery the files go to; the event for album-pdf.
  targetId: string;
  // What the indicator calls it: the gallery's title, or the client's name for album-pdf.
  title: string;
  // The screen that shows this upload (the indicator links there).
  href: string;
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
  // album-pdf: what the server answered once the file was saved on the event. The event page uses
  // it to finish the job (send the design to the client) and then dismisses the upload.
  result: AlbumPdfResult | null;
};

export type AlbumPdfResult = {
  stageKey: string;
  filename: string;
  // The server's "send this to the client" payload, when it has one.
  notify: { text?: string; downloadUrl?: string } | null;
  // A custom-package stage is marked done along with the upload; the saved stage row.
  stage: { done_at: string | null } | null;
};

export type GalleryVideoUploadRow = { id: string; storage_path: string; original_filename: string; file_size_bytes: number };

type Item = { file: File; path: string; contentType: string; row: Record<string, unknown> };

type Job = {
  state: GalleryUpload;
  userId: string;
  bucket: "galleries" | "album-designs";
  items: Item[];
  progress: number[];
  next: number;
  sortNext: number;
  hiddenDuring: boolean;
  cancel: boolean;
  urls: Map<number, Promise<string | null>>;
  urlsUpTo: number;
  // The transfers in flight, so a cancel stops them midway.
  transfers: Set<AbortController>;
};

const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
const itemListeners = new Map<string, Set<(value: unknown, file: File) => void>>();
let snapshot: GalleryUpload[] = [];
let workers = 0;
let tabId: string | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let windowHooked = false;

const URL_BATCH = 40;
// A finished upload stays in the list for a moment (the galleries list shows "הועלו ✓"); one with
// failed files stays until its screen shows them, or this long at most. An album PDF waiting to be
// sent to the client stays until the event page sends it.
const KEEP_DONE_MS = 20_000;
const KEEP_FAILED_MS = 10 * 60_000;

const concurrency = () => (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches ? 4 : 8);
const isActive = (j: Job) => j.state.phase === "queued" || j.state.phase === "uploading";
const isPhotoKind = (kind: UploadKind) => kind === "photos" || kind === "portfolio";
// Videos are big (up to 500MB each): two at a time leave room for everything else.
const maxInFlight = (j: Job) => (j.state.kind === "videos" ? 2 : Infinity);
const priority = (j: Job) => (j.state.kind === "album-pdf" ? 0 : j.state.kind === "videos" ? 1 : 2);

export function uploadKey(kind: UploadKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

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
  setBusyLabel("gallery-uploads", active.length === 0 ? null : active.every((j) => isPhotoKind(j.state.kind)) ? "העלאת תמונות" : "העלאת קבצים");
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

// One upload (running or just finished), or null.
export function useUpload(key: string): GalleryUpload | null {
  return useGalleryUploads().find((u) => u.key === key) ?? null;
}

export function getUpload(key: string): GalleryUpload | null {
  return snapshot.find((u) => u.key === key) ?? null;
}

export function isUploadActive(u: GalleryUpload | null): boolean {
  return !!u && (u.phase === "queued" || u.phase === "uploading");
}

// Photos still on their way to this gallery (they count toward its photo limit).
export function activeUploadCount(galleryId: string): number {
  const j = jobs.get(uploadKey("photos", galleryId));
  return j && isActive(j) ? j.state.total - j.state.done : 0;
}

// The screen that shows an upload listens for its files as they land, and while it does the upload
// counts as watched (no email or phone notification when it ends). The value is the saved row:
// GalleryPhotoRow for photos and portfolio, GalleryVideoUploadRow for videos, AlbumPdfResult for
// album-pdf.
export function onUploadItem(key: string, cb: (value: unknown, file: File) => void): () => void {
  let set = itemListeners.get(key);
  if (!set) itemListeners.set(key, (set = new Set()));
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) itemListeners.delete(key);
  };
}

export function onGalleryPhoto(galleryId: string, cb: (row: GalleryPhotoRow, file: File) => void): () => void {
  return onUploadItem(uploadKey("photos", galleryId), (value, file) => cb(value as GalleryPhotoRow, file));
}

export function sendUploadToBackground(key: string) {
  const j = jobs.get(key);
  if (!j) return;
  j.state.background = true;
  emit();
}

export function cancelUpload(key: string) {
  const j = jobs.get(key);
  if (!j || !isActive(j)) return;
  stop(j);
}

export function cancelAllUploads() {
  for (const j of jobs.values()) if (isActive(j)) stop(j);
}

function stop(j: Job) {
  j.cancel = true;
  j.transfers.forEach((c) => c.abort());
}

// Removes a finished upload from the list (its result was shown).
export function dismissUpload(key: string) {
  const j = jobs.get(key);
  if (!j || isActive(j)) return;
  jobs.delete(key);
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
  const job = jobFor({
    kind: "photos",
    targetId: input.galleryId,
    title: input.galleryTitle,
    href: `/galleries/${input.galleryId}`,
    userId: input.userId,
    bucket: "galleries",
    sortBase: input.sortBase,
  });
  add(
    job,
    input.items.map(({ file, folderId }) => {
      const heic = isHeicFile(file);
      const name = heic ? file.name.replace(/\.(heic|heif)$/i, ".jpg") : file.name;
      return {
        file,
        path: `${input.userId}/${input.galleryId}/${crypto.randomUUID()}-${name}`,
        contentType: heic ? "image/jpeg" : file.type || "application/octet-stream",
        row: { folder_id: folderId, sort_order: job.sortNext++ },
      };
    })
  );
}

// Photos straight to the portfolio, into the photographer's hidden portfolio gallery
// (PortfolioUploadPanel finds or creates it first), tagged with the chosen tab.
export function enqueuePortfolioUpload(input: {
  galleryId: string;
  userId: string;
  category: string | null;
  // A sub-tab inside that tab (needs a tab).
  subcategory?: string | null;
  files: File[];
}): void {
  if (input.files.length === 0) return;
  const job = jobFor({
    kind: "portfolio",
    targetId: input.galleryId,
    title: "פורטפוליו",
    href: "/settings?tab=portfolio",
    userId: input.userId,
    bucket: "galleries",
    sortBase: 0,
  });
  add(
    job,
    input.files.map((file) => {
      const heic = isHeicFile(file);
      const name = heic ? file.name.replace(/\.(heic|heif)$/i, ".jpg") : file.name;
      return {
        file,
        path: `${input.userId}/${input.galleryId}/${crypto.randomUUID()}-${name}`,
        contentType: heic ? "image/jpeg" : file.type || "application/octet-stream",
        row: {
          sort_order: job.sortNext++,
          in_portfolio: true,
          portfolio_category: input.category,
          portfolio_subcategory: input.category ? input.subcategory || null : null,
        },
      };
    })
  );
}

// A gallery's videos (the size limit of the photographer's plan is checked before this).
export function enqueueVideoUpload(input: { galleryId: string; galleryTitle: string; userId: string; sortBase: number; files: File[] }): void {
  if (input.files.length === 0) return;
  const job = jobFor({
    kind: "videos",
    targetId: input.galleryId,
    title: input.galleryTitle,
    href: `/galleries/${input.galleryId}`,
    userId: input.userId,
    bucket: "galleries",
    sortBase: input.sortBase,
  });
  add(
    job,
    input.files.map((file) => ({
      file,
      path: `${input.userId}/${input.galleryId}/video-${crypto.randomUUID()}-${file.name}`,
      contentType: file.type || "video/mp4",
      row: { sort_order: job.sortNext++ },
    }))
  );
}

// The album design PDF on an event's stage. Once it's in storage it's saved on the event (the
// standard "אישור עיצוב אלבום" stage), or the custom stage is marked done with it; the event page
// then sends it to the client (AlbumPdfResult). A new file for the same event replaces one still
// going.
export function enqueueAlbumPdfUpload(input: { eventId: string; title: string; userId: string; stageKey: string; file: File }): void {
  const key = uploadKey("album-pdf", input.eventId);
  const running = jobs.get(key);
  if (running && isActive(running)) return;
  jobs.delete(key);
  const job = jobFor({
    kind: "album-pdf",
    targetId: input.eventId,
    title: input.title,
    href: `/events/${input.eventId}`,
    userId: input.userId,
    bucket: "album-designs",
    sortBase: 0,
  });
  add(job, [
    {
      file: input.file,
      path: `${input.userId}/${input.eventId}/${crypto.randomUUID()}-${input.file.name}`,
      contentType: input.file.type || "application/octet-stream",
      row: { stageKey: input.stageKey },
    },
  ]);
}

function jobFor(init: { kind: UploadKind; targetId: string; title: string; href: string; userId: string; bucket: Job["bucket"]; sortBase: number }): Job {
  const key = uploadKey(init.kind, init.targetId);
  const existing = jobs.get(key);
  if (existing && isActive(existing)) return existing;
  const job: Job = {
    state: {
      key,
      kind: init.kind,
      targetId: init.targetId,
      title: init.title,
      href: init.href,
      total: 0,
      done: 0,
      succeeded: 0,
      failed: [],
      pct: 0,
      phase: "queued",
      background: false,
      finishedAt: null,
      result: null,
    },
    userId: init.userId,
    bucket: init.bucket,
    items: [],
    progress: [],
    next: 0,
    sortNext: init.sortBase,
    hiddenDuring: typeof document !== "undefined" && document.hidden,
    cancel: false,
    urls: new Map(),
    urlsUpTo: 0,
    transfers: new Set(),
  };
  // A new upload replaces a finished one still on the list.
  jobs.delete(key);
  jobs.set(key, job);
  return job;
}

function add(job: Job, items: Item[]) {
  hookWindow();
  for (const item of items) {
    job.items.push(item);
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

// The next file to send: the album PDF first, then videos, then photos in the order their uploads
// were started.
function takeNext(): { job: Job; i: number } | null {
  const ready = [...jobs.values()].filter((j) => isActive(j) && !j.cancel && j.next < j.items.length && j.next - j.state.done < maxInFlight(j));
  if (ready.length === 0) return null;
  const job = ready.reduce((best, j) => (priority(j) < priority(best) ? j : best));
  return { job, i: job.next++ };
}

function prefetchUrls(job: Job, fromIndex: number) {
  if (job.urlsUpTo > fromIndex + URL_BATCH / 2 || job.urlsUpTo >= job.items.length) return;
  const start = Math.max(job.urlsUpTo, fromIndex);
  const end = Math.min(job.items.length, start + URL_BATCH);
  job.urlsUpTo = end;
  const batch = fetch("/api/storage/upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket: job.bucket, items: job.items.slice(start, end).map((it) => ({ path: it.path, contentType: it.contentType })) }),
  })
    .then(async (res) => (res.ok ? ((await res.json()) as { urls?: string[] }).urls ?? null : null))
    .catch(() => null);
  for (let j = start; j < end; j++) job.urls.set(j, batch.then((urls) => urls?.[j - start] ?? null));
}

type Saved = { ok: true; value: unknown } | { ok: false; reason: string };

// What's done with a file once it's in storage, per kind.
async function save(job: Job, item: Item, file: File): Promise<Saved> {
  const { kind, targetId } = job.state;
  const supabase = createClient();
  if (kind === "photos" || kind === "portfolio") {
    const { data, error } = await supabase
      .from("gallery_photos")
      .insert({
        gallery_id: targetId,
        photographer_id: job.userId,
        storage_path: item.path,
        original_filename: file.name,
        file_size_bytes: file.size,
        ...item.row,
      })
      .select()
      .single<GalleryPhotoRow>();
    if (error || !data) return { ok: false, reason: error?.message ?? "שגיאה בשמירה" };
    // The lightbox preview is made now, so it's ready when the photographer opens the photo.
    fetch(`/api/galleries/${targetId}/photos/${data.id}/preview`, { redirect: "manual" }).catch(() => {});
    return { ok: true, value: data };
  }
  if (kind === "videos") {
    const { data, error } = await supabase
      .from("gallery_videos")
      .insert({
        gallery_id: targetId,
        photographer_id: job.userId,
        storage_path: item.path,
        original_filename: file.name,
        file_size_bytes: file.size,
        ...item.row,
      })
      .select("id, storage_path, original_filename, file_size_bytes")
      .single<GalleryVideoUploadRow>();
    if (error || !data) {
      // The DB trigger (enforce_gallery_video_by_plan) is the real gate, and the file already
      // reached storage by now: drop that orphaned object before reporting why it was refused.
      fetch("/api/storage/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "galleries", paths: [item.path] }),
      }).catch(() => {});
      const msg = error?.message ?? "";
      if (msg.includes("video_not_allowed_for_plan")) return { ok: false, reason: "וידאו בגלריה זמין רק במסלולי פרו ופרו+" };
      if (msg.includes("video_too_large_for_plan")) return { ok: false, reason: "הווידאו גדול מהמותר במסלול שלך" };
      return { ok: false, reason: msg || "שגיאה בשמירת הווידאו" };
    }
    return { ok: true, value: data };
  }
  // album-pdf
  const stageKey = String(item.row.stageKey);
  const body = { albumDesignPdfPath: item.path, albumDesignPdfFilename: file.name };
  const res =
    stageKey === "album_approval"
      ? await fetch(`/api/events/${targetId}/album-design`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch(`/api/events/${targetId}/stages`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(stageKey.startsWith("custom:") ? { stageKey: null, customStageId: stageKey.slice(7) } : { stageKey, customStageId: null }),
            done: true,
            ...body,
          }),
        });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, reason: data.error ?? (stageKey === "album_approval" ? "שגיאה בשמירת קובץ העיצוב" : "שגיאה בעדכון השלב") };
  const result: AlbumPdfResult = { stageKey, filename: file.name, notify: data.notify ?? null, stage: data.stage ?? null };
  job.state.result = result;
  return { ok: true, value: result };
}

async function worker() {
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
    let saved: unknown = undefined;
    try {
      if (isPhotoKind(job.state.kind) && isHeicFile(file)) {
        try {
          file = await convertHeicIfNeeded(file);
        } catch {
          failure = "המרה נכשלה";
        }
      }
      if (!failure) {
        if (job.bucket === "galleries" && isPhotoKind(job.state.kind)) prefetchUrls(job, i);
        let uploaded = false;
        let reason = "שגיאה לא ידועה";
        // A blip on one file in a big batch is likely; a couple of retries make it a non-event.
        for (let attempt = 0; attempt < 3 && !uploaded && !job.cancel; attempt++) {
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
                body: JSON.stringify({ bucket: job.bucket, path: item.path, contentType: item.contentType }),
              });
              const data = await res.json();
              if (!res.ok || !data.url) {
                reason = data.error ?? reason;
                continue;
              }
              url = data.url as string;
            }
            const transfer = new AbortController();
            job.transfers.add(transfer);
            try {
              await putFileWithProgress(
                url,
                file,
                item.contentType,
                (fraction) => {
                  job.progress[i] = fraction;
                  report(job, true);
                },
                transfer.signal
              );
            } finally {
              job.transfers.delete(transfer);
            }
            uploaded = true;
          } catch (e) {
            reason = e instanceof Error ? e.message : "שגיאת רשת";
          }
        }
        if (!uploaded) {
          // A file stopped by a cancel, or by the connection dropping, isn't a failed file.
          failure = job.state.phase === "offline" || job.cancel ? null : reason;
        } else {
          const result = await save(job, item, file);
          if (result.ok) saved = result.value;
          else failure = result.reason;
        }
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : "שגיאה לא צפויה";
    }
    job.progress[i] = 1;
    job.state.done++;
    if (saved !== undefined) {
      job.state.succeeded++;
      itemListeners.get(job.state.key)?.forEach((cb) => cb(saved, file));
    } else if (failure) {
      // The album PDF is one file: its screen shows the reason alone.
      job.state.failed.push(job.state.kind === "album-pdf" ? failure : `${file.name} (${failure})`);
    }
    report(job);
    if (job.state.done >= job.items.length && isActive(job)) finish(job, "done");
  }
}

function goOffline() {
  for (const j of jobs.values()) if (isActive(j)) stop(j);
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
  // the upload went to the background, they left its screen, or the app was hidden. The album PDF
  // isn't one of these: the indicator asks to send it to the client, which needs the app anyway.
  const { key, kind, targetId } = job.state;
  const watched = (itemListeners.get(key)?.size ?? 0) > 0 && !job.state.background;
  if (phase === "done" && kind !== "album-pdf" && job.state.succeeded > 0 && (!watched || job.hiddenDuring)) {
    fetch(`/api/galleries/${targetId}/upload-complete-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, succeededCount: job.state.succeeded, totalCount: job.state.total }),
      keepalive: true,
    }).catch(() => {});
  }
  if (kind === "album-pdf" && job.state.result) return;
  const keep = job.state.failed.length > 0 ? KEEP_FAILED_MS : KEEP_DONE_MS;
  setTimeout(() => {
    if (jobs.get(key) === job && !isActive(job)) {
      jobs.delete(key);
      emit();
    }
  }, keep);
}

// The cross-tab lock (lib/activeUploadLock.ts): another tab sees this one is uploading, and can
// ask it to cancel. Kept fresh by a heartbeat while anything is uploading. The album PDF (one file)
// doesn't hold it.
function writeLock() {
  const active = [...jobs.values()].filter((j) => isActive(j) && j.state.kind !== "album-pdf");
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
    galleryId: first.targetId,
    galleryTitle: active.length > 1 ? `${first.title} +${active.length - 1}` : first.title,
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
