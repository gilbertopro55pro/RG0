import { ADMIN_EMAIL } from "@/lib/admin";

// Extra assistant conversations sold in packs (owner, 2026-10-01). A one-time charge, separate from
// the subscription; bought conversations don't expire and are used only after the plan's monthly
// cap is reached (bot_conversations.extra_credit, migration 0147). Prices include VAT.
export const INTAKE_PACKS: { conversations: number; price: number }[] = [
  { conversations: 10, price: 10 },
  { conversations: 20, price: 18 },
  { conversations: 30, price: 25 },
  { conversations: 40, price: 35 },
  { conversations: 50, price: 40 },
];

export function intakePack(conversations: number) {
  return INTAKE_PACKS.find((p) => p.conversations === conversations) ?? null;
}

// PayPlus more_info_1 of a pack checkout, so the webhook tells it apart from a subscription charge.
export const INTAKE_PACK_TAG = "intake_pack:";

// The "90% of the monthly cap" phone notification.
export const INTAKE_ALERT_RATIO = 0.9;

// Buying packs is admin only until the owner checks a real purchase end to end (2026-10-01).
export function canBuyIntakePacks(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL;
}

// "2026-10" in Israel time.
export function monthKeyIsrael(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${parts.find((x) => x.type === "year")!.value}-${parts.find((x) => x.type === "month")!.value}`;
}
