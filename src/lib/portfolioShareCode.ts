// A short link to some of the portfolio's tabs (owner, 2026-10-20: "אני רוצה את הקישורים קצרים ונעימים
// לעין"). The share sheet used to add `?tabs=` with the tab names percent-encoded, so two Hebrew tabs
// came out as about 150 characters; now it's myframeflow.com/p/<slug>/<code>, 3 characters per tab.
// Each tab's 3 characters come from its name alone, so the browser builds the link on the tap that
// opens WhatsApp (iPhone blocks opening it after waiting on the server) and nothing is stored: the
// page matches the code against the photographer's current tabs (app/p/[slug]/[code]).

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SPACE = 62 ** 3;

export const SHARE_CODE_RE = /^(?:[0-9A-Za-z]{3}){1,30}$/;

// FNV-1a over the name's UTF-8 bytes, as 3 base-62 characters.
export function tabCode(name: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(name)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let n = h % SPACE;
  let out = "";
  for (let i = 0; i < 3; i++) {
    out = ALPHABET[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

// The code for these tabs, or null when it can't tell them apart from the other tabs: a tab left
// out with the same 3 characters as a chosen one would show up too (the caller then keeps the long
// link). The order doesn't matter, so the same tabs always give the same link.
export function shareCodeFor(chosen: string[], allTabs: string[]): string | null {
  if (chosen.length === 0) return null;
  const codes = new Set(chosen.map(tabCode));
  const picked = new Set(chosen);
  if (allTabs.some((t) => !picked.has(t) && codes.has(tabCode(t)))) return null;
  return [...codes].sort().join("");
}

// The tabs a code stands for, among the photographer's tabs now. A tab renamed or removed since
// the link was made just drops out.
export function tabsForShareCode(code: string, allTabs: string[]): string[] {
  if (!SHARE_CODE_RE.test(code)) return [];
  const codes = new Set(code.match(/.{3}/g) ?? []);
  return allTabs.filter((t) => codes.has(tabCode(t)));
}

// The message the share sheet sends with the link: signed with the photographer's saved signature,
// or else their name, never both (owner, 2026-10-20, like every message to a client). It used to add
// "<name> - צילום אירועים", which doubled up when the name already says it.
export function portfolioShareMessage(url: string, signature: string | null | undefined, name: string | null | undefined): string {
  const sign = signature?.trim() || name?.trim();
  return `היי, אשמח שתעיפו מבט בתיק העבודות שלי 📸\n${url}${sign ? `\n\n${sign}` : ""}`;
}
