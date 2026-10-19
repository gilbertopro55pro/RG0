import { remainingBalance } from "@/lib/closeEvent";
import type { EventPaymentRow } from "@/lib/types";

// "יתרות פתוחות" on the dashboard (owner, 2026-10-19): every client who still owes money, with the
// amount still open and the total of them all. Open = what's left of the deposit plus what's left of
// the balance, after partial payments. A balance recognized at the event's closing (closeEvent.ts)
// already counts as income, so it isn't open: the same rule as the "ממתין לתשלום" figure, so the
// two totals always match.

export type OpenBalanceRow = {
  eventId: string;
  clientName: string;
  eventDate: string;
  deposit: number;
  balance: number;
  total: number;
  dueDate: string | null;
  // The event already took place (before today, Israel date): the money is due now.
  held: boolean;
};

type EventLike = { id: string; client_name: string; event_date: string };

// What one event's client still owes: the deposit and the balance left after partial payments, the
// balance counting as paid once it was recognized at the closing. Also the amount of the home
// screen's payment reminder (api/scheduled-messages/[id]/confirm), so both say the same.
export function openAmount(
  p: Pick<EventPaymentRow, "deposit_amount" | "deposit_paid" | "deposit_paid_amount" | "balance_amount" | "balance_paid" | "balance_paid_amount">,
  recognized: boolean
): { deposit: number; balance: number; total: number } {
  const deposit = p.deposit_paid ? 0 : Math.max(0, Number(p.deposit_amount) - Number(p.deposit_paid_amount ?? 0));
  const balance = recognized ? 0 : remainingBalance(p);
  return { deposit, balance, total: deposit + balance };
}

export function openBalances(
  events: EventLike[],
  payments: EventPaymentRow[],
  recognizedEventIds: Set<string>,
  today: string
): { rows: OpenBalanceRow[]; total: number; heldTotal: number } {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const rows: OpenBalanceRow[] = [];
  for (const p of payments) {
    const event = eventById.get(p.event_id);
    if (!event) continue;
    const { deposit, balance, total } = openAmount(p, recognizedEventIds.has(p.event_id));
    if (total <= 0) continue;
    const eventDate = event.event_date.slice(0, 10);
    rows.push({ eventId: event.id, clientName: event.client_name, eventDate, deposit, balance, total, dueDate: p.balance_due_date, held: eventDate < today });
  }
  // Events that already took place first (oldest first: owed the longest), then the coming ones by date.
  rows.sort((a, b) => (a.held === b.held ? a.eventDate.localeCompare(b.eventDate) : a.held ? -1 : 1));
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const heldTotal = rows.filter((r) => r.held).reduce((sum, r) => sum + r.total, 0);
  return { rows, total, heldTotal };
}
