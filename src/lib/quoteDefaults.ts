import { ADMIN_EMAIL } from "@/lib/admin";
import { classifyName } from "@/lib/leadQuotePrefill";

// Admin-only quote extras for now (owner, 2026-10-01, "עדכון אדמין"):
// - the notes field starts with the delivery times, and its lines follow what the quote holds: the
//   video line only with a video item, the magnets line only with a magnets item;
// - the WhatsApp caption of the shared PDF names the client, the event and the date.
// Every other account keeps an empty notes field and the plain "הצעת מחיר" caption.

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
export function quoteShareCaption(clientName: string, eventType: string, dateDMY: string): string {
  const name = clientName.trim();
  const type = eventType.trim();
  const date = dateDMY.trim();
  return [name, "הצעת מחיר", type ? `ל${type}` : null, date ? `בתאריך ${date}` : null].filter(Boolean).join(" ");
}

// The WhatsApp message that sends the client the quote link (admin only, owner 2026-10-01): the
// caption, the /quotes/<token> link, and the photographer's signature from Settings when set.
// withContract: the quote page ends with signing the contract, so the message says so.
export function quoteLinkMessage(caption: string, url: string, signature: string | null | undefined, withContract = false): string {
  return [
    caption,
    "",
    `קישור להצעת המחיר: ${url}`,
    "יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.",
    withContract ? "אחרי האישור ממלאים כמה פרטים קצרים על האירוע וחותמים על החוזה, הכל באותו קישור." : null,
    signature?.trim() || null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
