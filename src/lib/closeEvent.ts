import type { SupabaseClient } from "@supabase/supabase-js";

// "YYYY-MM" in Israel time — the same key shape the revenue views use for their month buckets.
export function monthKeyIsrael(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return `${year}-${month}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("he-IL", { month: "long", year: "numeric", timeZone: "UTC" });
}

type BalanceLeg = { balance_amount: number; balance_paid: boolean; balance_paid_amount: number | null };

// What's still owed on the balance leg right now — always derived live, never stored.
export function remainingBalance(p: BalanceLeg | null | undefined): number {
  if (!p || p.balance_paid) return 0;
  return Math.max(0, Number(p.balance_amount) - Number(p.balance_paid_amount ?? 0));
}

export type ClosePreview = {
  openStagesCount: number;
  remaining: number;
  // A partial payment was already marked on the balance — the remainder then always goes to the
  // closing month, no choice offered.
  hasPartialPayment: boolean;
  createdMonth: string;
  closingMonth: string;
  // Nothing paid on the balance, and the event was saved in a different month than today: the
  // photographer must pick which month gets the whole remaining amount.
  needsMonthChoice: boolean;
};

export async function computeClosePreview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  eventId: string,
  now: Date = new Date()
): Promise<ClosePreview | null> {
  const [{ data: event }, { data: payment }, { data: stages }] = await Promise.all([
    supabase.from("events").select("id, created_at").eq("id", eventId).maybeSingle<{ id: string; created_at: string }>(),
    supabase.from("event_payments").select("balance_amount, balance_paid, balance_paid_amount").eq("event_id", eventId).maybeSingle<BalanceLeg>(),
    supabase.from("event_stages").select("done").eq("event_id", eventId).returns<{ done: boolean }[]>(),
  ]);
  if (!event) return null;
  const remaining = remainingBalance(payment);
  const hasPartialPayment = !!payment && !payment.balance_paid && Number(payment.balance_paid_amount ?? 0) > 0;
  const createdMonth = monthKeyIsrael(new Date(event.created_at));
  const closingMonth = monthKeyIsrael(now);
  return {
    openStagesCount: (stages ?? []).filter((s) => !s.done).length,
    remaining,
    hasPartialPayment,
    createdMonth,
    closingMonth,
    needsMonthChoice: remaining > 0 && !hasPartialPayment && createdMonth !== closingMonth,
  };
}

// The month the remainder gets recognized in for a given close request, or an error when a required
// choice is missing. `null` month = nothing to recognize.
export function resolveBalanceMonth(
  preview: ClosePreview,
  choice: "created" | "closing" | undefined
): { ok: true; month: string | null } | { ok: false; error: string } {
  if (preview.remaining <= 0) return { ok: true, month: null };
  if (preview.needsMonthChoice) {
    if (choice === "created") return { ok: true, month: preview.createdMonth };
    if (choice === "closing") return { ok: true, month: preview.closingMonth };
    return { ok: false, error: "יש לבחור באיזה חודש להוסיף את היתרה" };
  }
  return { ok: true, month: preview.closingMonth };
}

// Shared by every revenue view: the remaining balance recognized at closing, per event. Only events
// that are currently closed AND have a recognized month count (restoring an event clears both).
export function closingRecognitions(
  events: { id: string; closed_at: string | null; closed_balance_month: string | null }[],
  payments: (BalanceLeg & { event_id: string })[]
): { eventId: string; month: string; amount: number }[] {
  const paymentByEvent = new Map(payments.map((p) => [p.event_id, p]));
  const rows: { eventId: string; month: string; amount: number }[] = [];
  for (const e of events) {
    if (!e.closed_at || !e.closed_balance_month) continue;
    const amount = remainingBalance(paymentByEvent.get(e.id));
    if (amount > 0) rows.push({ eventId: e.id, month: e.closed_balance_month, amount });
  }
  return rows;
}
