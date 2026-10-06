"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// Keeping the photographer's place across the "יש עדכון חדש" reload (owner, 2026-10-06): an update
// in the middle of designing a frame or an album, or of an upload or export, must not send them
// back to the start.
// - Screens with unsaved work register a snapshot of it (useResumeState). Right before reloading,
//   UpdateReloadGate stores every snapshot, the page and the scroll position in sessionStorage
//   (saveResumeSnapshot); after the reload each screen takes its snapshot back (takeResumeState).
// - Work that can't survive a reload (an upload, an export, an automatic album design) marks itself
//   busy (useBusy); the gate then waits for it to finish and reloads by itself.

const KEY = "gf_update_resume";
const MAX_AGE_MS = 30 * 60 * 1000;

type Snapshot = { path: string; scrollY: number; ts: number; states: Record<string, unknown> };

const providers = new Map<string, () => unknown>();

// Registers `getState` as this screen's snapshot under `key` while mounted. Always reads the latest
// closure, so callers can pass an inline function.
export function useResumeState(key: string, getState: () => unknown) {
  const ref = useRef(getState);
  useEffect(() => {
    ref.current = getState;
  });
  useEffect(() => {
    const read = () => ref.current();
    providers.set(key, read);
    return () => {
      if (providers.get(key) === read) providers.delete(key);
    };
  }, [key]);
}

export function saveResumeSnapshot() {
  const states: Record<string, unknown> = {};
  providers.forEach((read, key) => {
    try {
      const state = read();
      if (state !== undefined && state !== null) states[key] = state;
    } catch {
      // A screen that can't describe its state just starts fresh.
    }
  });
  const snapshot: Snapshot = { path: location.pathname + location.search, scrollY: window.scrollY, ts: Date.now(), states };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable: the reload still happens, without the snapshot.
  }
}

function readSnapshot(): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (typeof snap?.ts !== "number" || Date.now() - snap.ts > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

function writeSnapshot(snap: Snapshot) {
  try {
    if (Object.keys(snap.states).length === 0 && snap.scrollY < 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    // ignore
  }
}

// The snapshot a screen registered under `key` before the reload, once: only on the same page it
// was taken on, and removed as it's handed back.
export function takeResumeState<T>(key: string): T | null {
  const snap = readSnapshot();
  if (!snap || snap.path !== location.pathname + location.search || !(key in snap.states)) return null;
  const state = snap.states[key] as T;
  delete snap.states[key];
  writeSnapshot(snap);
  return state;
}

// The scroll position to return to after the reload (once), or null.
export function takeResumeScroll(): number | null {
  const snap = readSnapshot();
  if (!snap || snap.path !== location.pathname + location.search || snap.scrollY < 0) return null;
  const y = snap.scrollY;
  snap.scrollY = -1;
  writeSnapshot(snap);
  return y;
}

// --- busy work ---
const busy = new Map<string, string>();
const listeners = new Set<() => void>();
let busyVersion = 0;
function emit() {
  busyVersion++;
  listeners.forEach((l) => l());
}

// While `label` is set, the work it describes is running (e.g. "העלאת התמונות") and a reload waits.
export function useBusy(key: string, label: string | null) {
  useEffect(() => {
    if (!label) return;
    busy.set(key, label);
    emit();
    return () => {
      busy.delete(key);
      emit();
    };
  }, [key, label]);
}

export function busyLabels(): string[] {
  return [...busy.values()];
}

export function useBusyLabels(): string[] {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => busyVersion,
    () => 0
  );
  return busyLabels();
}
