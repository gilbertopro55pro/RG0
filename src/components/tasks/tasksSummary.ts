import { useSyncExternalStore } from "react";
import { parseTasksSummary, type MorningDigestPref, type TasksSummary } from "@/lib/tasks";

// What the tasks entries know about the account, shared by the home screen's button (TasksButton)
// and the top nav's entry (useNavTasks), so a change in one panel shows on the other's number
// without asking the server again. Kept for the page's life: TopNav stays mounted across
// navigations, and signing out loads a full page, so it never crosses accounts.
// - The home screen writes what its server render already has (publishTasksSummary).
// - The nav asks api/tasks/summary when it first shows, and again when the answer is a minute old
//   (loadTasksSummary / refreshTasksSummaryIfStale).
// - An open panel writes its count and the daily reminder's settings as they change
//   (updateTasksSummary).

const STALE_MS = 60_000;

let current: TasksSummary | null = null;
let loadedAt = 0;
// Bumped by every local change, so an answer that left before it doesn't undo it.
let version = 0;
let inflight: Promise<TasksSummary | null> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export function currentTasksSummary(): TasksSummary | null {
  return current;
}

export function publishTasksSummary(next: TasksSummary) {
  current = next;
  loadedAt = Date.now();
  version += 1;
  emit();
}

// A panel's count or reminder settings, as they change. Nothing happens when nothing changed (the
// panel reports its count on every render of today's list).
export function updateTasksSummary(patch: { openCount?: number; morningDigest?: MorningDigestPref }) {
  if (!current?.photographer) return;
  const openCount = patch.openCount ?? current.openCount;
  const morningDigest = patch.morningDigest ?? current.morningDigest;
  if (
    openCount === current.openCount &&
    morningDigest.enabled === current.morningDigest.enabled &&
    morningDigest.minutes === current.morningDigest.minutes
  ) {
    return;
  }
  current = { ...current, openCount, morningDigest };
  version += 1;
  emit();
}

// Asks the server. One request at a time; null when it couldn't tell (offline, an error), and then
// what was known stays.
export function loadTasksSummary(): Promise<TasksSummary | null> {
  if (inflight) return inflight;
  const startedAt = version;
  inflight = fetch("/api/tasks/summary", { cache: "no-store" })
    .then(async (res): Promise<TasksSummary | null> => {
      // Signed out, the request is sent to the login page (an HTML answer): not a photographer here.
      if (res.status === 401 || res.redirected) return { photographer: false };
      if (!res.ok) return null;
      return parseTasksSummary(await res.json().catch(() => null));
    })
    .catch(() => null)
    .then((answer) => {
      if (!answer) return null;
      // A panel changed something while the request was out: its numbers are newer.
      const next =
        startedAt !== version && answer.photographer && current?.photographer
          ? { ...answer, openCount: current.openCount, morningDigest: current.morningDigest }
          : answer;
      publishTasksSummary(next);
      return next;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// On showing the nav, on moving between screens and when the app comes back to the foreground: a
// new answer only when the last one is a minute old (a task the print-house check added, another
// device, a new day). An account known not to be a photographer isn't asked again.
export function refreshTasksSummaryIfStale(now: number = Date.now()) {
  if (current && !current.photographer) return;
  if (current && now - loadedAt < STALE_MS) return;
  void loadTasksSummary();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The server render knows nothing of it (null), so the first render after loading matches it.
export function useTasksSummary(): TasksSummary | null {
  return useSyncExternalStore(subscribe, currentTasksSummary, () => null);
}

// Tests only.
export function resetTasksSummaryForTests() {
  current = null;
  loadedAt = 0;
  version = 0;
  inflight = null;
  listeners.clear();
}
