import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAD_FOLLOW_UP_TEMPLATES } from "@/lib/stages";

// The WhatsApp text sent to a lead after a price quote — greeting, one short line, then the
// photographer's own signature (photographers.whatsapp_signature) on its own paragraph when set.
export function leadQuoteFollowUpMessage(leadName: string, signature: string | null | undefined): string {
  const body = `שלום ${leadName},\nשלחתי אלייך הצעת מחיר ואשמח לשמוע אם יש שאלות או שתרצו לתאם את תאריך האירוע.`;
  return signature?.trim() ? `${body}\n\n${signature.trim()}` : body;
}

// "תזכורת" on the quote follow-up prompt (owner, 2026-10-15): the minutes the photographer can
// pick, as on the new-lead popup.
export const QUOTE_FOLLOWUP_REMIND_MINUTES = [30, 60, 180] as const;

export type FollowUpLeadState = {
  status: string | null;
  archived_at: string | null;
  converted_event_id: string | null;
  quote_approved_at: string | null;
  last_activity_at: string | null;
};

// A quote follow-up needs no prompt once the lead moved on: won, lost, archived, booked, or the
// client approved the quote. One the photographer put off ("תזכורת", remindSetAt) is also done when
// anything happened on the lead since (a new quote, a status or a note change, the client writing
// again): that's the lead handled by hand.
export function quoteFollowUpHandled(lead: FollowUpLeadState | null, remindSetAt: string | null): boolean {
  if (!lead) return true;
  if (lead.status === "won" || lead.status === "lost" || lead.archived_at || lead.converted_event_id || lead.quote_approved_at) return true;
  return !!remindSetAt && !!lead.last_activity_at && Date.parse(lead.last_activity_at) > Date.parse(remindSetAt);
}

// The lead columns quoteFollowUpHandled reads.
export const FOLLOW_UP_LEAD_COLUMNS = "status, archived_at, converted_event_id, quote_approved_at, last_activity_at";

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
  // One pending nudge per lead: sending the quote again (or an updated one) moves it, instead of
  // adding a second one beside it.
  await supabase
    .from("scheduled_messages")
    .update({ status: "canceled" })
    .eq("lead_id", leadId)
    .eq("kind", "lead_quote_followup")
    .eq("status", "pending");
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
