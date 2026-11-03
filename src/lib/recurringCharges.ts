import type { SupabaseClient } from "@supabase/supabase-js";
import { chargesByPhotographer, recurringChargeAmount } from "@/lib/billedAmount";

// Server side of billedAmount.ts: reads the charged PayPlus callbacks and returns, per account, the
// amount its standing order on file really charges. Needs the service role (payplus_webhook_events
// has no policy for photographers). Only the amount and the recurring uid are read from the payload.

type ChargeRow = { photographer_id: string | null; amount: string | null; recurring_uid: string | null };

export async function recurringAmounts(
  serviceRole: SupabaseClient,
  accounts: { id: string; payplus_recurring_uid: string | null }[]
): Promise<Map<string, number>> {
  const withRecurring = accounts.filter((a) => a.payplus_recurring_uid);
  const out = new Map<string, number>();
  if (withRecurring.length === 0) return out;
  const { data, error } = await serviceRole
    .from("payplus_webhook_events")
    .select(
      "photographer_id, amount:payload->transaction->>amount, recurring_uid:payload->transaction->recurring_charge_information->>recurring_uid"
    )
    .eq("outcome", "charged")
    .in(
      "photographer_id",
      withRecurring.map((a) => a.id)
    )
    .order("created_at", { ascending: false })
    .returns<ChargeRow[]>();
  if (error) {
    console.error("recurringAmounts: reading charges failed:", error.message);
    return out;
  }
  const grouped = chargesByPhotographer(data ?? []);
  for (const account of withRecurring) {
    const amount = recurringChargeAmount(account.payplus_recurring_uid, grouped.get(account.id) ?? []);
    if (amount != null) out.set(account.id, amount);
  }
  return out;
}
