// The premium look (owner, 2026-10-07) is for the photographer's own app only. Pages a client or
// a visitor sees keep their own design: they're styled by the photographer's choices (gallery
// theme, logo) or are marketing/legal pages.
const CLIENT_FACING_PREFIXES = [
  "/gallery/",
  "/quotes/",
  "/contracts/",
  "/portal/",
  "/chat/",
  "/p/",
  "/print/",
  "/landing",
  "/en",
  "/ru",
  "/waitlist",
  "/terms",
  "/privacy",
  "/accessibility",
  "/cookies",
  "/cancellation-policy",
  "/business-info",
];

export function isClientFacingPath(path: string): boolean {
  return CLIENT_FACING_PREFIXES.some((p) => {
    const base = p.replace(/\/$/, "");
    return path === base || path.startsWith(`${base}/`);
  });
}

export const PREMIUM_CLASS = "gf-premium";
