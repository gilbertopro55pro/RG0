// Short client links (owner, 2026-10-16: a shared link should be pleasant to look at, not a long
// one). A link sent to a client is myframeflow.com/s/p4kX9aQ2bTz instead of
// myframeflow.com/portal/<36-character token>. The code is made from the token itself: a letter for
// the kind, then the token's first 16 hex digits (64 bits, 60 of them random in a v4 UUID) in base
// 62. So nothing is stored, and the link can be built on the very tap that opens WhatsApp (iPhone
// blocks opening it after waiting on the server). app/s/[code]/route.ts finds the token by that
// prefix (a range on the token's unique index) and redirects to the full page, whose link preview
// is the one shown. 60 random bits are far out of reach of guessing.

export type ShortLinkKind = "portal" | "gallery" | "quote" | "contract";

export const SHORT_LINK_PATH: Record<ShortLinkKind, string> = {
  portal: "/portal/",
  gallery: "/gallery/",
  quote: "/quotes/",
  contract: "/contracts/",
};

const KIND_CHAR: Record<ShortLinkKind, string> = { portal: "p", gallery: "g", quote: "q", contract: "c" };
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
// 62^11 > 2^64: 11 characters hold the 16 hex digits.
const CODE_LEN = 11;
const B62 = BigInt(62);
const MAX = BigInt(1) << BigInt(64);

function shortCode(kind: ShortLinkKind, token: string): string | null {
  const hex = token.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  let n = BigInt(`0x${hex.slice(0, 16)}`);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out = ALPHABET[Number(n % B62)] + out;
    n /= B62;
  }
  return KIND_CHAR[kind] + out;
}

// The link to send. `search` ("?folders=…") is kept as is; a token that isn't a UUID keeps the long form.
export function shortClientUrl(origin: string, kind: ShortLinkKind, token: string, search = ""): string {
  const code = shortCode(kind, token);
  return code ? `${origin}/s/${code}${search}` : `${origin}${SHORT_LINK_PATH[kind]}${token}${search}`;
}

// The kind and the token range a code stands for, or null for a code this never made.
export function parseShortCode(code: string): { kind: ShortLinkKind; from: string; to: string } | null {
  if (code.length !== CODE_LEN + 1) return null;
  const kind = (Object.keys(KIND_CHAR) as ShortLinkKind[]).find((k) => KIND_CHAR[k] === code[0]);
  if (!kind) return null;
  let n = BigInt(0);
  for (const ch of code.slice(1)) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    n = n * B62 + BigInt(v);
  }
  if (n >= MAX) return null;
  const h = n.toString(16).padStart(16, "0");
  const head = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}`;
  return { kind, from: `${head}-0000-000000000000`, to: `${head}-ffff-ffffffffffff` };
}

// The query of a gallery link the photographer sends: the chosen tabs when they're only some of
// them, and the web quality. An empty choice is the whole gallery, never "?folders=" with nothing
// after it: the "send to the client" button right after publishing builds the link before the tab
// picker was ever opened, and sent ".../s/<code>?folders=" (2026-10-21).
export function galleryShareSearch(tabKeys: string[] | null, chosen: ReadonlySet<string>, quality: "full" | "web"): string {
  const params = new URLSearchParams();
  if (tabKeys && tabKeys.length > 0 && chosen.size > 0 && !tabKeys.every((k) => chosen.has(k))) params.set("folders", [...chosen].join(","));
  if (quality === "web") params.set("quality", "web");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// A short link's query as forwarded to the full page, without empty parameters (links already sent
// with "?folders=" open as the plain link).
export function forwardedSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of [...new Set(params.keys())]) if (params.getAll(key).every((v) => v === "")) params.delete(key);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
