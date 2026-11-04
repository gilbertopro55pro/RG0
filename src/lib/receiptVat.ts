// VAT on the dashboard (owner, 2026-11-04, "עדכון אדמין"): the total VAT of the receipts an עוסק
// מורשה issued from the system, for the month or the year on screen, and for the two-month VAT
// reporting period of the selected month.
//
// Each receipt keeps the tax status it was issued under and the VAT in it (`receipt_links`,
// migration 0206), so receipts issued as עוסק פטור carry no VAT here, and the total shows up on its
// own once the photographer switches to מורשה. A receipt's amount is what the client paid, VAT
// included.

export const VAT_RATE = 0.18;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The VAT inside an amount that includes it: ₪1,180 → ₪180. */
export function vatIncluded(amount: number, rate = VAT_RATE): number {
  if (!(amount > 0)) return 0;
  return round2((amount * rate) / (1 + rate));
}

/** The VAT a receipt carries, by the tax status it is issued under. */
export function receiptVat(amount: number, taxStatus: "exempt" | "licensed"): number {
  return taxStatus === "licensed" ? vatIncluded(amount) : 0;
}

/** One receipt as the dashboard needs it. `month` is YYYY-MM on the Israel calendar. */
export type VatReceipt = { month: string; amount: number; vat: number; licensed: boolean };

export type ReceiptLinkVatRow = {
  created_at: string;
  amount: number | string | null;
  tax_status: "exempt" | "licensed" | null;
  vat_amount: number | string | null;
};

const israelMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" });

/** YYYY-MM of a moment, on the Israel calendar (a receipt at 01:30 on the 1st belongs to that month). */
export function israelMonthKey(at: string | Date): string {
  const parts = israelMonth.formatToParts(typeof at === "string" ? new Date(at) : at);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/** The rows of `receipt_links` as dashboard receipts. Rows without an amount (none since 0157) are left out. */
export function vatReceipts(rows: ReceiptLinkVatRow[]): VatReceipt[] {
  const out: VatReceipt[] = [];
  for (const r of rows) {
    const amount = Number(r.amount);
    if (!(amount > 0)) continue;
    const licensed = r.tax_status === "licensed";
    // The VAT stored when the receipt was issued; a row without it falls back to the status on it.
    const stored = r.vat_amount == null ? null : Number(r.vat_amount);
    const vat = stored != null && Number.isFinite(stored) ? stored : licensed ? vatIncluded(amount) : 0;
    out.push({ month: israelMonthKey(r.created_at), amount, vat, licensed });
  }
  return out;
}

export type VatTotal = {
  /** VAT in the receipts issued as מורשה. */
  vat: number;
  /** What those receipts total, VAT included. */
  gross: number;
  /** Before VAT. */
  net: number;
  /** Receipts issued as מורשה. */
  count: number;
  /** Receipts issued as פטור in the same period: no VAT, not counted above. */
  exemptCount: number;
};

/** The total for a set of months (YYYY-MM). */
export function vatTotal(receipts: VatReceipt[], months: Set<string> | ((month: string) => boolean)): VatTotal {
  const inPeriod = typeof months === "function" ? months : (m: string) => months.has(m);
  let vat = 0;
  let gross = 0;
  let count = 0;
  let exemptCount = 0;
  for (const r of receipts) {
    if (!inPeriod(r.month)) continue;
    if (!r.licensed) {
      exemptCount++;
      continue;
    }
    vat += r.vat;
    gross += r.amount;
    count++;
  }
  vat = round2(vat);
  gross = round2(gross);
  return { vat, gross, net: round2(gross - vat), count, exemptCount };
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** The two-month VAT reporting period of a month: January–February, March–April, … */
export function reportingPeriod(year: number, month: number): { from: number; to: number; months: Set<string> } {
  const from = month % 2 === 1 ? month : month - 1;
  return { from, to: from + 1, months: new Set([monthKey(year, from), monthKey(year, from + 1)]) };
}

/** The two-month reporting periods of a year that had receipts, for the year view. */
export function vatByReportingPeriod(receipts: VatReceipt[], year: number): { from: number; to: number; total: VatTotal }[] {
  const out: { from: number; to: number; total: VatTotal }[] = [];
  for (let from = 1; from <= 11; from += 2) {
    const period = reportingPeriod(year, from);
    const total = vatTotal(receipts, period.months);
    if (total.count > 0 || total.exemptCount > 0) out.push({ from: period.from, to: period.to, total });
  }
  return out;
}

/** Whether the dashboard shows the VAT card: licensed today, or any receipt that carried VAT. */
export function showsVat(taxStatus: "exempt" | "licensed" | null | undefined, receipts: VatReceipt[]): boolean {
  return taxStatus === "licensed" || receipts.some((r) => r.licensed && r.vat > 0);
}
