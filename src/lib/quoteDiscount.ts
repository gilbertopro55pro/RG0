// A discount on a quote (owner, 2026-10-17): in shekels or as a percent of the items' sum, taken off
// before VAT, so VAT is charged on the price after the discount. Shared by the builder, the PDF, the
// client's quote page and the quote history.

export type QuoteDiscountType = "amount" | "percent";

// amount: the shekels taken off (before VAT), stored so every reader shows the same number.
export type QuoteDiscount = { type: QuoteDiscountType; value: number; amount: number };

// To the agora, half up. In floating point n * 100 can land a hair under .5 (274.725 * 100 is
// 27472.499999999996), which Math.round alone takes down a whole agora; 12 significant digits clear
// that noise first.
export const roundAgorot = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const round2 = roundAgorot;

// Never more than the items' sum: a quote can't go below zero.
export function discountAmount(itemsSum: number, type: QuoteDiscountType, value: number): number {
  if (!(value > 0) || !(itemsSum > 0)) return 0;
  const raw = type === "percent" ? (itemsSum * Math.min(value, 100)) / 100 : value;
  return round2(Math.min(raw, itemsSum));
}

// subtotal: after the discount, before VAT (what the VAT line is computed on).
export function quoteTotals(itemsSum: number, discount: { type: QuoteDiscountType; value: number } | null, vatRate: number) {
  const off = discount ? discountAmount(itemsSum, discount.type, discount.value) : 0;
  const subtotal = round2(itemsSum - off);
  const vatAmount = vatRate > 0 ? round2(subtotal * vatRate) : 0;
  return { itemsSum, discountAmount: off, subtotal, vatAmount, total: round2(subtotal + vatAmount) };
}

// What a saved quote carries: null when there's no discount.
export function toQuoteDiscount(type: QuoteDiscountType, value: number, amount: number): QuoteDiscount | null {
  return amount > 0 ? { type, value, amount } : null;
}

// A discount read back from JSON (a lead's quote_details, a saved quote): only a well-formed one counts.
export function readQuoteDiscount(raw: unknown): QuoteDiscount | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<QuoteDiscount>;
  if ((d.type !== "amount" && d.type !== "percent") || !(Number(d.value) > 0) || !(Number(d.amount) > 0)) return null;
  return { type: d.type, value: Number(d.value), amount: Number(d.amount) };
}
