import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { LeadStatus } from "@/lib/types";
import { cancelLeadFollowUps } from "@/lib/leadFollowUp";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const body: {
    status?: LeadStatus;
    notes?: string;
    quoted_amount?: number;
    quote_note?: string;
    converted_event_id?: string;
  } = await request.json();

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) update.status = body.status;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.quoted_amount !== undefined) update.quoted_amount = body.quoted_amount;
  if (body.quote_note !== undefined) update.quote_note = body.quote_note;
  if (body.converted_event_id !== undefined) {
    // RLS scopes the lead ROW being updated to this photographer's own, but converted_event_id is
    // a foreign key that only requires SOME event to exist — with no check here, a caller could
    // point their own lead at any event UUID, including another photographer's. Confirm the event
    // actually belongs to this same photographer before allowing the link.
    const { data: event } = await supabase.from("events").select("id").eq("id", body.converted_event_id).eq("photographer_id", user.id).maybeSingle();
    if (!event) {
      return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 400 });
    }
    update.converted_event_id = body.converted_event_id;
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", leadId)
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בעדכון הליד" }, { status: 500 });
  }

  // A won/lost lead is done deciding — stop nudging it.
  if (body.status === "won" || body.status === "lost") {
    await cancelLeadFollowUps(supabase, leadId);
  }

  return NextResponse.json({ lead });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: lead } = await supabase.from("leads").select("bot_conversation_id").eq("id", leadId).maybeSingle<{ bot_conversation_id: string | null }>();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // The assistant conversation holds the client's details too; it goes with the lead (same as the
  // automatic purge in lib/leadRetention.ts). Service role, scoped to this photographer.
  if (lead?.bot_conversation_id) {
    await createServiceRoleClient().from("bot_conversations").delete().eq("id", lead.bot_conversation_id).eq("photographer_id", user.id);
  }

  return NextResponse.json({ ok: true });
}
