// Cross-tab "is a photo upload already running" lock. Unlike album exports (a real DB job row a
// Fly worker processes independently of the browser), a photo upload IS the browser's own
// fetch/XHR calls — there's no server process to poll instead, so localStorage is the actual
// source of truth here, not just a pointer to one. A heartbeat (not a single write) is what makes
// a crashed/closed tab's lock expire on its own instead of permanently blocking every future
// upload — see STALE_MS below.
export const ACTIVE_UPLOAD_STORAGE_KEY = "activeGalleryUpload";
const STALE_MS = 15000;

export type ActiveUploadLock = {
  galleryId: string;
  galleryTitle: string;
  totalCount: number;
  doneCount: number;
  lastHeartbeat: number;
  cancelRequested: boolean;
};

export function readActiveUploadLock(): ActiveUploadLock | null {
  try {
    const raw = localStorage.getItem(ACTIVE_UPLOAD_STORAGE_KEY);
    if (!raw) return null;
    const lock = JSON.parse(raw) as ActiveUploadLock;
    if (Date.now() - lock.lastHeartbeat > STALE_MS) return null;
    return lock;
  } catch {
    return null;
  }
}

export function writeActiveUploadLock(lock: ActiveUploadLock): void {
  try {
    localStorage.setItem(ACTIVE_UPLOAD_STORAGE_KEY, JSON.stringify(lock));
  } catch {}
}

// Only clears the lock if it still belongs to this same gallery's upload — a stale read racing a
// newer upload that already started elsewhere must never clobber that newer lock.
export function clearActiveUploadLock(galleryId: string): void {
  try {
    const raw = localStorage.getItem(ACTIVE_UPLOAD_STORAGE_KEY);
    if (!raw) return;
    const lock = JSON.parse(raw) as ActiveUploadLock;
    if (lock.galleryId === galleryId) localStorage.removeItem(ACTIVE_UPLOAD_STORAGE_KEY);
  } catch {}
}

// Cross-tab cancel: the blocked tab flips this flag on the shared lock, and the uploading tab's
// own worker loop polls it (alongside its local cancelRequestedRef) so a cancel initiated from
// wherever the photographer actually is takes effect, not just from the tab that started it.
export function requestActiveUploadCancel(): void {
  const lock = readActiveUploadLock();
  if (lock) writeActiveUploadLock({ ...lock, cancelRequested: true });
}
