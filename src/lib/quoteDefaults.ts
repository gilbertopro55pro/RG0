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

export function deliveryNotes(itemNames: string[]): string {
  const cats = new Set(itemNames.map((n) => classifyName(n)));
  const video = cats.has("video") || cats.has("clip");
  const magnets = cats.has("magnets");
  return [
    "זמני אספקה:",
    "תמונות עד 7 ימי עסקים",
    video ? "וידאו עד 35 ימי עסקים" : null,
    "גלריית תמונות בתוקף ל-3 חודשים",
    magnets ? "מגנטים טרמיים בגודל 7.5x10 ס״מ, 8 הגדלות מגנט." : null,
  ]
    .filter(Boolean)
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
export function quoteLinkMessage(caption: string, url: string, signature: string | null | undefined): string {
  return [caption, "", `קישור להצעת המחיר: ${url}`, "יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.", signature?.trim() || null]
    .filter((l) => l !== null)
    .join("\n");
}
