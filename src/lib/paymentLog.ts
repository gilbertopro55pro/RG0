// Every payment received on a leg, with the day it came in (owner, 2026-11-02, "תיקון"): a partial
// payment counts in the month it came in, and completing it later counts only the rest, in the month
// of the completion. Until now a leg kept one date (`{leg}_paid_at`), and completing a partial
// payment moved the whole amount, the earlier part too, to the completion's month.
//
// `{leg}_payments` (migration 0205) is kept by a trigger from the totals every writer already sets
// (`{leg}_paid`, `{leg}_paid_amount`). The revenue views read it here. A row without the list (or a
// list that doesn't add up to what was received) counts as before: everything on the paid date.

import type { EventPaymentRow } from "@/lib/types";
import type { PaymentField } from "@/lib/eventQuickActions";

export type PaymentLogEntry = { amount: number; at: string };

// Not in EventPaymentRow (lib/types.ts is part of the PDF worker's build): the pages select `*`.
export type PaymentLogColumns = { deposit_payments?: unknown; balance_payments?: unknown };

type LegRow = Pick<
  EventPaymentRow,
  "deposit_amount" | "deposit_paid" | "deposit_paid_amount" | "deposit_paid_at" | "balance_amount" | "balance_paid" | "balance_paid_amount" | "balance_paid_at"
> &
  PaymentLogColumns;

// What came in on the leg so far.
export function receivedOnLeg(p: LegRow, field: PaymentField): number {
  return p[`${field}_paid`] ? Number(p[`${field}_amount`]) || 0 : Number(p[`${field}_paid_amount`] ?? 0) || 0;
}

function parseLog(raw: unknown): PaymentLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const amount = Number((e as { amount?: unknown })?.amount);
    const at = (e as { at?: unknown })?.at;
    if (!(amount > 0) || typeof at !== "string" || Number.isNaN(Date.parse(at))) return [];
    return [{ amount, at }];
  });
}

// The payments received on the leg, oldest first.
export function legPayments(p: LegRow, field: PaymentField): PaymentLogEntry[] {
  const received = receivedOnLeg(p, field);
  if (received <= 0) return [];
  const log = parseLog(p[`${field}_payments`]);
  const sum = log.reduce((s, e) => s + e.amount, 0);
  if (log.length && Math.abs(sum - received) < 0.01) return log;
  const at = p[`${field}_paid_at`];
  return at ? [{ amount: received, at }] : [];
}

// "full": the whole leg at once. "partial": a payment toward it. "completion": the last payment of a
// leg that was paid in parts.
export type PaymentKind = "full" | "partial" | "completion";

export type RevenueEntry = { eventId: string; field: PaymentField; amount: number; at: string; kind: PaymentKind };

export function revenueEntries(payments: readonly (LegRow & { event_id: string })[]): RevenueEntry[] {
  const out: RevenueEntry[] = [];
  for (const p of payments) {
    for (const field of ["deposit", "balance"] as const) {
      const entries = legPayments(p, field);
      const paid = !!p[`${field}_paid`];
      entries.forEach((e, i) => {
        const kind: PaymentKind = !paid ? "partial" : entries.length === 1 ? "full" : i === entries.length - 1 ? "completion" : "partial";
        out.push({ eventId: p.event_id, field, amount: e.amount, at: e.at, kind });
      });
    }
  }
  return out;
}

// Undoing the mark on a fully paid leg. Paid in parts: only the completion is undone, back to the
// partial payment as it was (the trigger keeps the earlier payments and their dates). Paid at once:
// back to unpaid.
export function undoPaymentPatch(field: PaymentField, paid: boolean, entries: readonly PaymentLogEntry[]): Record<string, unknown> {
  if (paid && entries.length > 1) {
    const before = entries.slice(0, -1);
    const amount = Math.round(before.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    return { [`${field}_paid`]: false, [`${field}_paid_at`]: before[before.length - 1].at, [`${field}_paid_amount`]: amount };
  }
  return { [`${field}_paid`]: false, [`${field}_paid_at`]: null, [`${field}_paid_amount`]: null };
}
