// Whether a screen the router keeps in memory may be out of date (2026-10-24, speed round 2).
// A screen visited in the last minute opens from the router's saved copy, instantly
// (experimental.staleTimes in next.config.ts). Every request that can change data marks it
// (GlobalLoadingBar's fetch patch): anything but GET/HEAD to our own /api/, or to Supabase's REST
// (supabase-js writes from the browser). The next navigation then drops every saved copy first
// (FreshNavigation), so a list never shows what was just deleted or renamed.

// A POST that only reads (a dry run, a preview) sends this header, so opening a screen that makes
// one (the home screen's message prompts) doesn't count as a change.
export const READ_ONLY_HEADER = "x-read-only";

export function isDataChangingRequest(url: string, method: string, origin: string, readOnly = false): boolean {
  if (readOnly) return false;
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  let u: URL;
  try {
    u = new URL(url, origin);
  } catch {
    return false;
  }
  if (u.origin === origin) return u.pathname.startsWith("/api/");
  return u.protocol === "https:" && u.hostname.endsWith(".supabase.co") && u.pathname.startsWith("/rest/v1/");
}

// The URL, method and read-only mark of a fetch() call, whichever form its arguments take.
export function fetchRequestOf(input: RequestInfo | URL, init?: RequestInit): { url: string; method: string; readOnly: boolean } {
  const request = typeof input === "object" && !(input instanceof URL) ? input : null;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? request?.method ?? "GET";
  const headers = new Headers(init?.headers ?? request?.headers);
  return { url, method, readOnly: headers.get(READ_ONLY_HEADER) === "1" };
}

let changed = false;

export function markDataChanged(): void {
  changed = true;
}

// True once per change: the navigation that asks drops the saved copies for everyone after it.
export function takeDataChanged(): boolean {
  const was = changed;
  changed = false;
  return was;
}

// Before a router.push/replace that follows a save: drops the saved copies when anything changed,
// so the screen it opens is fetched fresh instead of shown from memory. router.refresh() clears
// every saved copy right away; the push that follows takes its place and loads the new screen.
export function refreshIfDataChanged(router: { refresh: () => void }): void {
  if (takeDataChanged()) router.refresh();
}
