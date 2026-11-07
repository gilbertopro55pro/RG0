import { ADMIN_EMAIL } from "@/lib/admin";
import { classifyName } from "@/lib/leadQuotePrefill";
import { dateLocale, type Lang } from "@/i18n/config";
import { makeT } from "@/i18n/translate";
import type { Messages } from "@/i18n/types";
import clientQuote from "@/i18n/dict/clientQuote";
import clientQuoteSend from "@/i18n/dict/clientQuoteSend";
import eventTypes from "@/i18n/dict/eventTypes";
import clientMessages from "@/i18n/dict/clientMessages";
import { clientGreeting, clientSignature } from "@/lib/clientMessageFormat";
import { clientGreetingName } from "@/lib/magnetApproval";

// Admin-only quote extras for now (owner, 2026-10-01, "עדכון אדמין"):
// - the notes field starts with the delivery times, and its lines follow what the quote holds: the
//   video line only with a video item, the magnets line only with a magnets item;
// - the WhatsApp caption of the shared PDF names the client, the event and the date.
// Every other account keeps an empty notes field and the plain "הצעת מחיר" caption.

// Only the areas these messages need (the quote's wording and the preset event types), not the
// merged dictionary (@/i18n/dict): this file runs in the browser too, and that import shipped every
// area's text, ~830KB, to the event and leads pages.
const messageCache: Partial<Record<Exclude<Lang, "he">, Messages>> = {};
function quoteT(lang: Lang) {
  if (lang === "he") return makeT({});
  return makeT((messageCache[lang] ??= { ...clientQuote[lang], ...clientQuoteSend[lang], ...eventTypes[lang], ...clientMessages[lang] }));
}

export function quoteExtrasFor(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL;
}

const VIDEO_LINE = "וידאו עד 35 ימי עסקים";
const MAGNETS_LINE = "מגנטים טרמיים בגודל 7.5x10 ס״מ, 8 הגדלות מגנט.";

// Which conditional lines the quote's items call for. A row left at ₪0 doesn't count (owner,
// 2026-10-01: the magnets line must never show on a quote without magnets).
function itemCategories(items: { item: string; price: number }[]) {
  const cats = new Set(items.filter((it) => it.price > 0).map((it) => classifyName(it.item)));
  return { video: cats.has("video") || cats.has("clip"), magnets: cats.has("magnets") };
}

export function deliveryNotes(items: { item: string; price: number }[]): string {
  const { video, magnets } = itemCategories(items);
  return ["זמני אספקה:", "תמונות עד 7 ימי עסקים", video ? VIDEO_LINE : null, "גלריית תמונות בתוקף ל-3 חודשים", magnets ? MAGNETS_LINE : null]
    .filter(Boolean)
    .join("\n");
}

// Notes the photographer edited by hand stop following the items, but the video and magnets lines
// still come out when their item isn't on the quote (only those exact lines, nothing they wrote).
export function withoutStaleDeliveryLines(notes: string, items: { item: string; price: number }[]): string {
  const { video, magnets } = itemCategories(items);
  return notes
    .split("\n")
    .filter((line) => (video || line.trim() !== VIDEO_LINE) && (magnets || line.trim() !== MAGNETS_LINE))
    .join("\n");
}

// "הילה שפירו הצעת מחיר לבר מצווה בתאריך 22.10.2026" — the parts that are missing are left out.
// UI languages phase 3: in the client's language (the builder's picker; Hebrew unless chosen). A
// standard event type reads in that language, one the photographer typed stays as typed; the date
// is written out in the client's locale (isoDate, "2026-10-22"), else dateDMY as given.
export function quoteShareCaption(clientName: string, eventType: string, dateDMY: string, lang: Lang = "he", isoDate?: string): string {
  const name = clientName.trim();
  const type = eventType.trim();
  const date = dateDMY.trim();
  if (lang === "he") {
    return [name, "הצעת מחיר", type ? `ל${type}` : null, date ? `בתאריך ${date}` : null].filter(Boolean).join(" ");
  }
  // "Price quote for Hila Shapiro – Bar Mitzvah, 22 October 2026".
  const t = quoteT(lang);
  const head = name ? t("הצעת מחיר עבור {name}", { name }) : t("הצעת מחיר");
  const tail = [type ? t(type) : null, isoDate ? localDate(isoDate, lang) ?? date : date].filter(Boolean).join(", ");
  return tail ? `${head} – ${tail}` : head;
}

function localDate(isoDate: string, lang: Lang): string | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// The WhatsApp message that sends the client the quote link (owner, 2026-11-07, its own shape):
//
//   {name} שלום,
//   מצורפת הצעת מחיר לחתונה בתאריך 22.10.2026
//
//   קישור להצעת המחיר: {the /quotes/<token> link}
//   יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.
//   [the contract line, when the quote ends with signing]
//
//   תיק העבודות שלי: {myframeflow.com/p/<slug>, when the portfolio is on}
//   {the photographer's WhatsApp signature, or their name without one}
//
// `caption` is quoteShareCaption without the name ("הצעת מחיר לחתונה בתאריך …"). lang: the
// client's language (UI languages phase 3; English and Russian greet as every client message does);
// the signature stays as the photographer wrote it. approved: sent again from the event page after
// the client approved it (owner, 2026-10-22), so it asks to view the quote, not to approve it.
export function quoteLinkMessage(
  caption: string,
  url: string,
  signature: string | null | undefined,
  withContract = false,
  lang: Lang = "he",
  approved = false,
  opts: { clientName?: string | null; senderName?: string | null; portfolioUrl?: string | null } = {}
): string {
  const t = quoteT(lang);
  const name = opts.clientName?.trim() ? clientGreetingName(opts.clientName) : null;
  const greeting = lang === "he" ? (name ? `${name} שלום,` : "שלום,") : clientGreeting(name, lang);
  const cap = caption.trim();
  const intro = cap ? (lang === "he" ? `מצורפת ${cap}` : cap) : null;
  const linkLines = [
    `${t("קישור להצעת המחיר:")} ${url}`,
    approved ? t("יש ללחוץ על הקישור לצפייה בהצעת המחיר.") : t("יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר."),
    withContract && !approved ? t("לאחר האישור ממלאים כמה פרטים קצרים על האירוע וחותמים על החוזה, הכל באותו קישור.") : null,
  ];
  const portfolio = opts.portfolioUrl?.trim() ? `${t("תיק העבודות שלי:")} ${opts.portfolioUrl.trim()}` : null;
  const ending = [portfolio, clientSignature(signature, opts.senderName)].filter(Boolean).join("\n");
  return [[greeting, intro].filter(Boolean).join("\n"), linkLines.filter(Boolean).join("\n"), ending].filter(Boolean).join("\n\n");
}
