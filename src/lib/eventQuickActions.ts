// Quick actions on an event without opening it (owner, 2026-10-26, "עדכון שקוף"): a "פעולות"
// dropdown on each row of the home list and on the next-shoot card (EventQuickActions): share the
// gallery, mark a full or partial payment, issue a receipt for what was marked as paid, and send a
// reminder (payment, the clip songs, the photos for the album) on WhatsApp. The data comes from
// api/events/[id]/quick-actions when the menu opens; the rules are here, shared with the event page.

import type { EventPaymentRow } from "@/lib/types";
import type { Lang } from "@/i18n/config";
import { amountToDocument, type PaymentLegDocState } from "@/lib/paymentDocuments";

export type PaymentField = "deposit" | "balance";
export const PAYMENT_FIELDS: readonly PaymentField[] = ["deposit", "balance"];

export type QuickPaymentLeg = { amount: number; paid: boolean; paidAmount: number | null };

// What the menu gets from api/events/[id]/quick-actions. The messages are built on the server, so a
// tap opens WhatsApp right away (an iPhone blocks opening it after waiting for the server).
export type QuickActionsData = {
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  eventType: string | null;
  payments: Record<PaymentField, QuickPaymentLeg> | null;
  // The invoice provider (Finbot / Green Invoice) is connected, and what a receipt can cover now.
  receipt: { connected: boolean; legs: { field: PaymentField; amount: number }[] };
  // The gallery stage's message with the gallery's link, when it's published and not archived.
  gallery: { state: "none" | "draft" | "archived" | "ready"; stageLabel: string; message: string | null };
  reminders: Record<QuickReminderKind, { blocked: string | null; message: string | null; amount?: number }>;
};

type LegColumns = Pick<
  EventPaymentRow,
  | "deposit_amount"
  | "deposit_paid"
  | "deposit_paid_amount"
  | "deposit_documented_amount"
  | "deposit_document_url"
  | "balance_amount"
  | "balance_paid"
  | "balance_paid_amount"
  | "balance_documented_amount"
  | "balance_document_url"
>;

export function legDocState(p: LegColumns, field: PaymentField): PaymentLegDocState {
  return {
    amount: Number(p[`${field}_amount`]) || 0,
    paid: !!p[`${field}_paid`],
    paidAmount: p[`${field}_paid_amount`] == null ? null : Number(p[`${field}_paid_amount`]),
    documentedAmount: p[`${field}_documented_amount`] == null ? null : Number(p[`${field}_documented_amount`]),
    documentUrl: p[`${field}_document_url`] ?? null,
  };
}

// What a receipt can cover now, per leg: money marked as received that no receipt covers yet. The
// quick receipt is issued for exactly this amount (owner: "הקבלה מופקת רק על הסכום שסומן ששולם").
export function receiptLegs(p: LegColumns | null): { field: PaymentField; amount: number }[] {
  if (!p) return [];
  return PAYMENT_FIELDS.map((field) => ({ field, amount: amountToDocument(legDocState(p, field)) })).filter((l) => l.amount > 0);
}

// The three payment states of a leg, as the event page writes them (EventDetailView): fully paid
// (`{field}_paid`), partly paid (`{field}_paid_amount`, `{field}_paid` stays false) or unpaid.
// `{field}_paid_at` is when money last came in on the leg: the revenue charts bucket by it.
export function fullPaymentPatch(field: PaymentField, nowIso: string): Record<string, unknown> {
  return { [`${field}_paid`]: true, [`${field}_paid_at`]: nowIso, [`${field}_paid_amount`]: null };
}

export function unpaidPatch(field: PaymentField): Record<string, unknown> {
  return { [`${field}_paid`]: false, [`${field}_paid_at`]: null, [`${field}_paid_amount`]: null };
}

// A partial amount that reaches the leg's whole amount is the full payment. null: not a positive
// amount.
export function partialPaymentPatch(field: PaymentField, amount: number, owed: number, nowIso: string): Record<string, unknown> | null {
  if (!(amount > 0)) return null;
  if (amount >= owed) return fullPaymentPatch(field, nowIso);
  return { [`${field}_paid`]: false, [`${field}_paid_at`]: nowIso, [`${field}_paid_amount`]: Math.round(amount * 100) / 100 };
}

// The stage the photo selection for the album is: the built-in one, or a custom stage named for
// choosing photos ("בחירת תמונות לאלבום").
export function photoSelectionStageOf<S extends { key: string; label: string }>(stages: readonly S[]): S | null {
  return (
    stages.find((s) => s.key === "client_photo_selection") ??
    stages.find((s) => s.key.startsWith("custom:") && /בחיר/.test(s.label) && /תמונ/.test(s.label)) ??
    null
  );
}

export type QuickReminderKind = "payment" | "songs" | "photos";
export const QUICK_REMINDER_KINDS: readonly QuickReminderKind[] = ["payment", "songs", "photos"];

// Why a reminder can't be sent now (a Hebrew key, translated on the screen), or null when it can.
export function quickReminderBlock(
  kind: QuickReminderKind,
  e: {
    hasPhone: boolean;
    openTotal: number;
    songStage: { done: boolean } | null;
    songsChosen: boolean;
    photoStage: { done: boolean } | null;
    // The photos are chosen in the gallery: without a published one there's nothing to choose yet.
    galleryState: "none" | "draft" | "archived" | "ready";
  }
): string | null {
  if (!e.hasPhone) return "אין טלפון ללקוח";
  if (kind === "payment") return e.openTotal > 0 ? null : "אין יתרה פתוחה";
  if (kind === "songs") {
    if (!e.songStage) return "אין בחירת שירים בחבילה";
    return e.songStage.done || e.songsChosen ? "השירים כבר נבחרו" : null;
  }
  if (!e.photoStage) return "אין בחירת תמונות בחבילה";
  if (e.photoStage.done) return "התמונות כבר נבחרו";
  if (e.galleryState === "none") return "אין גלריה לאירוע";
  if (e.galleryState === "draft") return "הגלריה עוד לא פורסמה";
  return e.galleryState === "archived" ? "הגלריה בארכיון" : null;
}

// The photos reminder when the photographer saved no message of their own for the stage: the
// built-in one for it is the generic "an update on your event: <stage> ✓", which reads as done.
export const PHOTO_SELECTION_REMINDER: Record<Lang, string> = {
  he: "שלום {{שם}},\nתזכורת קטנה: מחכים לבחירת התמונות שלכם לאלבום 📸\nנכנסים לגלריה ובוחרים את התמונות שתרצו שיהיו באלבום.\nקישור: ",
  en: "Hi {{שם}},\nA quick reminder: we're waiting for your photo picks for the album 📸\nGo into the gallery and choose the photos you'd like in it.\nLink: ",
  ru: "Здравствуйте, {{שם}}!\nНебольшое напоминание: ждём, когда вы выберете фотографии для альбома 📸\nЗайдите в галерею и отметьте снимки, которые хотите видеть в альбоме.\nСсылка: ",
};

// The event log line of a reminder sent from the quick actions. The song and photo ones name the
// stage the way a stage message from the event page does (`בנוגע לשלב "…"`), so the daily song
// reminder sees it as a recent ask (send-scheduled-messages); the payment one carries "תזכורת
// תשלום", which the dashboard's open balances read back.
export function quickReminderLogText(kind: QuickReminderKind, stageLabel: string | null): string {
  if (kind === "payment") return "נשלחה תזכורת תשלום בוואטסאפ";
  return `נשלחה תזכורת בוואטסאפ בנוגע לשלב "${stageLabel ?? ""}"`;
}

// The events list on the home screen: rows or blocks (owner, 2026-10-26), remembered on this device
// in a cookie like the galleries page (lib/galleriesView.ts), so the server renders the chosen one.
export type EventsLayout = "list" | "grid";
export const EVENTS_LAYOUT_COOKIE = "events_view";

export function parseEventsLayout(value: string | undefined | null): EventsLayout {
  return value === "grid" ? "grid" : "list";
}

export function eventsLayoutCookie(layout: EventsLayout): string {
  return `${EVENTS_LAYOUT_COOKIE}=${layout}; path=/; max-age=31536000; samesite=lax`;
}
