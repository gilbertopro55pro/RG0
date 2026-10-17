"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadTabId, type GalleryUpload } from "@/lib/galleryUploads";

// Uploads seen from another device (owner, 2026-10-16; upload_progress, migration 0181). The
// upload engine (lib/galleryUploads.ts) runs in one tab; here it leaves a row every few seconds, and
// the galleries list and the gallery page on any other device read the rows. The desktop app and
// the FTP watcher leave rows through their server routes (bump_upload_progress), without a total.

export type RemoteUpload = {
  id: string;
  galleryId: string;
  kind: "photos" | "portfolio" | "videos";
  source: "web" | "desktop" | "ftp";
  // phone / tablet / computer / desktop_app for a browser upload; the source otherwise.
  device: string | null;
  title: string | null;
  total: number | null;
  done: number;
  succeeded: number;
  pct: number | null;
  // "uploading" that stopped moving reads as "stalled" (browser) or "done" (desktop app, FTP).
  status: "uploading" | "stalled" | "done" | "cancelled" | "offline";
  updatedAt: number;
};

type Row = {
  id: string;
  gallery_id: string;
  kind: RemoteUpload["kind"];
  source: RemoteUpload["source"];
  device: string | null;
  title: string | null;
  total: number | null;
  done: number;
  succeeded: number;
  pct: number | null;
  phase: "uploading" | "done" | "cancelled" | "offline";
  updated_at: string;
};

// A browser tab writes every 5s: quiet for 30s means it stopped (closed, asleep, offline). The
// desktop app saves a photo every few seconds: quiet for a minute means its batch ended.
const WEB_STALE_MS = 30_000;
const SERVER_DONE_MS = 60_000;
// Rows older than this aren't shown at all.
const SHOW_MS = 5 * 60_000;
const WRITE_EVERY_MS = 5_000;

export function deviceKind(): string {
  if (typeof navigator === "undefined") return "computer";
  const ua = navigator.userAgent;
  if (/Electron/i.test(ua)) return "desktop_app";
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "tablet";
  if (/iPhone|Android.*Mobile|Mobile/i.test(ua)) return "phone";
  if (/Android/i.test(ua)) return "tablet";
  return "computer";
}

// --- Writing (from the upload engine) ---

const written = new Map<string, string>();
let lastWrite = 0;
let cleaned = false;

// Called by the engine's heartbeat (every 3s while anything uploads) and when an upload ends. Writes
// at most every 5s, except an upload's last state, which goes out at once.
export function reportRemoteUploads(tabId: string, jobs: { state: GalleryUpload; userId: string }[], force = false) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!force && now - lastWrite < WRITE_EVERY_MS) return;
  lastWrite = now;
  const supabase = createClient();
  const device = deviceKind();
  const rows = jobs
    .filter(({ state }) => state.kind !== "album-pdf")
    .map(({ state, userId }) => ({
      id: `${tabId}:${state.key}`,
      photographer_id: userId,
      gallery_id: state.targetId,
      kind: state.kind,
      source: "web",
      device,
      title: state.title,
      total: state.total,
      done: state.done,
      succeeded: state.succeeded,
      pct: Math.round(state.pct),
      phase: state.phase === "queued" ? "uploading" : state.phase,
      updated_at: new Date(now).toISOString(),
      // Why it stopped, for diagnosis (migration 0182).
      note: state.halted ? [state.halted.reason, state.halted.detail, navigator.userAgent].filter(Boolean).join(" | ").slice(0, 500) : null,
    }))
    // An upload that ended is written once; one still running is refreshed every time (it's the
    // heartbeat another device reads).
    .filter((r) => {
      const sig = `${r.phase}:${r.done}:${r.total}`;
      if (r.phase !== "uploading" && written.get(r.id) === sig) return false;
      written.set(r.id, sig);
      return true;
    });
  if (rows.length === 0) return;
  const send = (list: typeof rows) => void supabase.from("upload_progress").upsert(list, { onConflict: "id" }).then(() => {});
  send(rows);
  // An upload's final state goes out again a moment later: a progress write sent just before it can
  // land after it, and the upload then looks like it's still running on other devices (seen
  // 2026-10-17). Chaining the writes instead let one slow request hold back all the others.
  const finals = rows.filter((r) => r.phase !== "uploading");
  if (finals.length > 0) setTimeout(() => send(finals), 2000);
  if (!cleaned) {
    cleaned = true;
    void supabase
      .from("upload_progress")
      .delete()
      .lt("updated_at", new Date(now - 24 * 3600_000).toISOString())
      .then(() => {});
  }
}

// --- Reading (galleries list, gallery page) ---

function toRemote(r: Row, now: number): RemoteUpload | null {
  const updatedAt = Date.parse(r.updated_at);
  const age = now - updatedAt;
  if (age > SHOW_MS) return null;
  let status: RemoteUpload["status"] = r.phase;
  if (r.phase === "uploading") {
    if (r.source === "web") status = age > WEB_STALE_MS ? "stalled" : "uploading";
    else status = age > SERVER_DONE_MS ? "done" : "uploading";
  }
  return {
    id: r.id,
    galleryId: r.gallery_id,
    kind: r.kind,
    source: r.source,
    device: r.device,
    title: r.title,
    total: r.total,
    done: r.done,
    succeeded: r.succeeded,
    pct: r.pct,
    status,
    updatedAt,
  };
}

// Uploads of this account running elsewhere: on another device, or another tab of this one. This
// tab's own uploads are left out (the engine shows them). Refreshed every 8s while the page is
// visible.
export function useRemoteUploads(galleryId?: string): RemoteUpload[] {
  const [rows, setRows] = useState<RemoteUpload[]>([]);
  useEffect(() => {
    const supabase = createClient();
    const ownTabId = uploadTabId();
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      let q = supabase
        .from("upload_progress")
        .select("id, gallery_id, kind, source, device, title, total, done, succeeded, pct, phase, updated_at")
        .gt("updated_at", new Date(Date.now() - SHOW_MS).toISOString())
        .order("updated_at", { ascending: false })
        .limit(20);
      if (galleryId) q = q.eq("gallery_id", galleryId);
      const { data } = await q.returns<Row[]>();
      if (cancelled) return;
      const now = Date.now();
      const next = (data ?? [])
        .filter((r) => !r.id.startsWith(`${ownTabId}:`))
        .map((r) => toRemote(r, now))
        .filter((r): r is RemoteUpload => !!r);
      // The gallery page is big: it redraws only when something here changed, not every 8 seconds.
      setRows((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    void load();
    const timer = setInterval(load, 8_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [galleryId]);
  return rows;
}

// "מהמחשב", "מהטלפון"... for the line that shows a remote upload.
export function remoteDeviceText(r: RemoteUpload): string {
  if (r.source === "ftp") return "מהמצלמה (FTP)";
  if (r.source === "desktop" || r.device === "desktop_app") return "מאפליקציית המחשב";
  if (r.device === "phone") return "מהטלפון";
  if (r.device === "tablet") return "מהטאבלט";
  return "מהמחשב";
}
