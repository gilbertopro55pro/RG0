import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAD_FOLLOW_UP_TEMPLATES } from "@/lib/stages";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Called once, right after a lead is first created — schedules all three follow-up steps up
// front rather than one-at-a-time, so the cron job doesn't need to know anything about sequencing
// (it just sends whatever's due). A lead that reaches 'won'/'lost' has its remaining steps
// canceled via cancelLeadFollowUps below, so this never over-schedules in practice.
export async function scheduleLeadFollowUps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  leadId: string,
  photographerId: string
) {
  const { data: photographer } = await supabase
    .from("photographers")
    .select("lead_follow_up_enabled")
    .eq("id", photographerId)
    .maybeSingle<{ lead_follow_up_enabled: boolean }>();
  if (!photographer?.lead_follow_up_enabled) return;

  const now = new Date();
  const rows = LEAD_FOLLOW_UP_TEMPLATES.map((step, i) => ({
    lead_id: leadId,
    kind: "lead_follow_up" as const,
    sequence_step: i + 1,
    send_at: addDays(now, step.delayDays).toISOString(),
  }));
  await supabase.from("scheduled_messages").insert(rows);
}

// Called right after a quote is sent from the leads page (src/app/api/leads/[id]/quote/route.ts)
// — schedules a single photographer-facing "did you follow up?" nudge 2 days out. Separate from
// scheduleLeadFollowUps above: this one is anchored on the quote being sent (not lead creation),
// is a single step (not a 3-step sequence), and notifies the PHOTOGRAPHER rather than the lead.
export async function scheduleLeadQuoteFollowUp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  leadId: string
) {
  await supabase.from("scheduled_messages").insert({
    lead_id: leadId,
    kind: "lead_quote_followup" as const,
    send_at: addDays(new Date(), 2).toISOString(),
  });
}

// Called whenever a lead's status changes away from 'new'/'quoted' (i.e. it converted or died) —
// cancels any follow-up steps still pending (both the lead-facing sequence and the
// photographer-facing quote nudge) so a won/lost lead never gets a stray notification.
export async function cancelLeadFollowUps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  leadId: string
) {
  await supabase
    .from("scheduled_messages")
    .update({ status: "canceled" })
    .eq("lead_id", leadId)
    .in("kind", ["lead_follow_up", "lead_quote_followup"])
    .eq("status", "pending");
}
