// Standalone iOS PWA-specific workaround: even with everything else fixed (no zoom/transform, no
// sticky-inside-scroll, a real-size-only mount), a real device kept mistapping inside the album
// tool after rotating from portrait — but ONLY there, never after a genuine route navigation away
// from and back to the gallery page. Whatever iOS is caching (hit-test regions, gesture recognizer
// state — this isn't something inspectable from here) apparently only resets on an actual route
// change, not on any in-place remount within the same mounted page. So instead of trying to fix the
// state in place, this forces a real navigation cycle: leave the gallery page, land briefly on
// /galleries, then navigate straight back — and once back, the tool re-opens itself automatically,
// already confirmed landscape, with a loading spinner covering every step so it looks like one
// continuous load rather than a flash of the galleries list. Confirmed by hand on a real device to
// fix the mistap; this sessionStorage handoff is what survives the two full unmounts in between.
export type AlbumRotateResumeIntent =
  | { galleryId: string; kind: "manage"; ts: number }
  | { galleryId: string; kind: "canvas"; spreadId: string; mode: "overlay" | "custom"; ts: number };

const KEY = "gf_album_rotate_resume";
// Generous but not unbounded — covers a slow round trip through /galleries without risking a
// leftover flag (an interrupted flow, a closed tab) auto-opening the tool on some unrelated later
// visit to the same gallery.
const MAX_AGE_MS = 15000;

// Plain `Omit<Union, "ts">` collapses to only the union members' SHARED keys (a well-known TS
// quirk) — this `extends any` form forces it to distribute over each member first, so `spreadId`/
// `mode` survive on the "canvas" branch instead of being typed away.
type WithoutTs<T> = T extends unknown ? Omit<T, "ts"> : never;

export function writeAlbumRotateResume(intent: WithoutTs<AlbumRotateResumeIntent>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...intent, ts: Date.now() } as AlbumRotateResumeIntent));
  } catch {
    // Storage unavailable (private mode, quota) — the rotate just won't auto-recover; the manual
    // rotate-prompt flow still works normally either way.
  }
}

export function readAlbumRotateResume(): AlbumRotateResumeIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AlbumRotateResumeIntent;
    if (typeof parsed?.ts !== "number" || Date.now() - parsed.ts > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearAlbumRotateResume() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
