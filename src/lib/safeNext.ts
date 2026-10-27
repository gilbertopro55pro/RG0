// Where to go after signing in (/login?next=…), so a link from an email or a phone notification that
// hit the login page still opens once the photographer signs in. Only a path on this site: a crafted
// link must not send them to another site after signing in (an open redirect). Null = the home screen.
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\u0000-\u001f\\]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, "https://site.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://site.invalid") return null;
  const path = url.pathname;
  if (path === "/" || path === "/login" || path === "/signup" || path.startsWith("/api/")) return null;
  return `${path}${url.search}${url.hash}`;
}
