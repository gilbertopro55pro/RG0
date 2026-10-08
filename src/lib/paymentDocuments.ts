// How much of a payment leg (deposit/balance) a new receipt should cover (owner, 2026-10-08:
// receipts on partial payments too). A receipt is always for money actually received: the paid
// amount so far (all of it once the leg is marked fully paid) minus what earlier receipts on this
// leg already covered.
export type PaymentLegDocState = {
  amount: number; // the leg's declared amount
  paid: boolean;
  paidAmount: number | null; // received so far on a partial payment
  documentedAmount: number | null;
  documentUrl: string | null;
};

export function receivedOnLeg(leg: PaymentLegDocState): number {
  if (leg.paid) return Number(leg.amount) || 0;
  return Math.max(0, Number(leg.paidAmount) || 0);
}

// A receipt issued before documented amounts were tracked covered the whole leg.
export function documentedOnLeg(leg: PaymentLegDocState): number {
  if (leg.documentedAmount != null) return Number(leg.documentedAmount) || 0;
  return leg.documentUrl ? Number(leg.amount) || 0 : 0;
}

export function amountToDocument(leg: PaymentLegDocState): number {
  const diff = receivedOnLeg(leg) - documentedOnLeg(leg);
  return diff > 0.004 ? Math.round(diff * 100) / 100 : 0;
}

// How the client paid, chosen when issuing the receipt (owner, 2026-10-08).
export type ReceiptPaymentMethod = "cash" | "bit" | "paybox" | "transfer" | "other";

export const RECEIPT_PAYMENT_METHODS: { id: ReceiptPaymentMethod; label: string }[] = [
  { id: "cash", label: "מזומן" },
  { id: "bit", label: "ביט" },
  { id: "paybox", label: "פייבוקס" },
  { id: "transfer", label: "העברה בנקאית" },
  { id: "other", label: "אחר" },
];

// The words that go on the receipt for the method ("other" carries the photographer's own text).
export function paymentMethodLabel(method: ReceiptPaymentMethod | undefined, otherText?: string): string | null {
  if (!method) return null;
  if (method === "other") return otherText?.trim() || "אחר";
  return RECEIPT_PAYMENT_METHODS.find((m) => m.id === method)?.label ?? null;
}
