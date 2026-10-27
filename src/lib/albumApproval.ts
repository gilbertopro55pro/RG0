import type { Lang } from "@/i18n/config";
import { clientGreetingName } from "@/lib/magnetApproval";

// Sending the album design to the client for approval (owner, 2026-10-27). The album tool's
// "שליחה לאישור הלקוח/ה" opens the message in ClientMessageSheet (WhatsApp, SMS, email or copy);
// the link is the gallery's short link with ?album=1, which opens the album right away, and at the
// end of the album the client approves it or marks corrections. The send is recorded on the way
// out (api/galleries/[id]/album/send-to-client): the album shows as sent (gallery_albums.sent_at),
// and a reminder to nudge the client is scheduled (album_approval_reminder, lib/clientReminders.ts)
// after photographers.album_approval_reminder_days (1–14, 3 by default), unless switched off
// (album_approval_reminder). Client-safe: no server imports.

export const ALBUM_CLIENT_SEARCH = "?album=1";

export const ALBUM_REMINDER_DAYS_DEFAULT = 3;
export const ALBUM_REMINDER_DAY_OPTIONS: readonly number[] = Array.from({ length: 14 }, (_, i) => i + 1);

export function isAlbumReminderDays(value: unknown): value is number {
  return typeof value === "number" && ALBUM_REMINDER_DAY_OPTIONS.includes(value);
}

const TEXT: Record<Lang, { body: string; subject: string }> = {
  he: {
    body: "שלום {name},\nעיצוב האלבום מוכן 🎉\nאפשר לדפדף בו כאן, ובסוף העיצוב לאשר אותו או לסמן תיקונים:\n{link}",
    subject: "עיצוב האלבום שלכם",
  },
  en: {
    body: "Hi {name},\nYour album design is ready 🎉\nYou can flip through it here, and at the end approve it or mark corrections:\n{link}",
    subject: "Your album design",
  },
  ru: {
    body: "Здравствуйте, {name}!\nДизайн вашего альбома готов 🎉\nЕго можно пролистать здесь, а в конце утвердить или отметить исправления:\n{link}",
    subject: "Дизайн вашего альбома",
  },
};

// The message to the client, in the client's language, signed like every other client message: the
// photographer's signature, or their name without one, never both.
export function albumApprovalMessage(p: {
  clientName: string;
  link: string;
  signature: string | null | undefined;
  senderName: string | null | undefined;
  lang: Lang;
}): string {
  const name = clientGreetingName(p.clientName);
  const body = TEXT[p.lang].body.replace("{link}", p.link);
  const text = name ? body.replace("{name}", name) : body.replace(/^.*\{name\}.*\n/, "");
  const signature = p.signature?.trim() || p.senderName?.trim();
  return signature ? `${text}\n\n${signature}` : text;
}

export function albumApprovalSubject(lang: Lang): string {
  return TEXT[lang].subject;
}

// GET /api/galleries/<id>/album/send-to-client: what the send window needs.
export type AlbumClientInfo = {
  // The client sees the album only in a published gallery that isn't archived.
  published: boolean;
  client: { name: string; phone: string | null; email: string | null; lang: Lang };
  link: string;
  message: string;
  subject: string;
};

// Where an event's album design stands with the client, for the home screen's event row: sent for
// approval (and when), approved (and when), or the client asked for corrections.
// `at`: when it moved (for corrections, when the design was sent; "" when unknown).
export type AlbumApprovalLine = { kind: "sent" | "approved" | "changes"; at: string };

export type AlbumStateRow = {
  status: string;
  sent_at: string | null;
  approved_at: string | null;
  gallery: { event_id: string | null } | { event_id: string | null }[] | null;
};

function lineOf(row: AlbumStateRow): { line: AlbumApprovalLine; at: string } | null {
  if (row.status === "approved" && row.approved_at) return { line: { kind: "approved", at: row.approved_at }, at: row.approved_at };
  if (row.status === "changes_requested") return { line: { kind: "changes", at: row.sent_at ?? "" }, at: row.sent_at ?? "" };
  if (row.status === "sent" && row.sent_at) return { line: { kind: "sent", at: row.sent_at }, at: row.sent_at };
  return null;
}

// By event id. An event with more than one gallery album takes the one that moved last. Albums sent
// before sent_at existed have no date, so no line.
export function albumApprovalByEvent(rows: readonly AlbumStateRow[]): Record<string, AlbumApprovalLine> {
  const out: Record<string, { line: AlbumApprovalLine; at: string }> = {};
  for (const row of rows) {
    const gallery = Array.isArray(row.gallery) ? row.gallery[0] : row.gallery;
    const eventId = gallery?.event_id;
    if (!eventId) continue;
    const found = lineOf(row);
    if (!found) continue;
    if (!out[eventId] || found.at > out[eventId].at) out[eventId] = found;
  }
  return Object.fromEntries(Object.entries(out).map(([id, v]) => [id, v.line]));
}

// When the client approves, the album goes to the print house by itself (photographers
// .album_auto_print, api/gallery/[token]/album/approve): the JPGs are rendered at the album's own size,
// and the email's notes say what that size is. A page with a size of its own (a square cover in a
// panoramic album) is named too. Hebrew, like the rest of the print-house email.
export function printSizeNote(
  album: { width_cm: number | string; height_cm: number | string },
  pages: readonly { width_cm: number | string | null; height_cm: number | string | null }[]
): string {
  const cm = (v: number | string) => String(Math.round(Number(v) * 10) / 10);
  const size = (w: number | string, h: number | string) => `${cm(w)}×${cm(h)} ס״מ`;
  const lines = [`מידות האלבום: ${size(album.width_cm, album.height_cm)}`];
  pages.forEach((page, i) => {
    if (page.width_cm === null || page.height_cm === null) return;
    if (cm(page.width_cm) === cm(album.width_cm) && cm(page.height_cm) === cm(album.height_cm)) return;
    lines.push(`${i === 0 ? "מידות הכריכה" : `מידות עמוד ${i + 1}`}: ${size(page.width_cm, page.height_cm)}`);
  });
  return lines.join("\n");
}
