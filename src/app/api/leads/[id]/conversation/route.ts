import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcriptOf } from "@/lib/intakeAssistant";

// The intake-assistant conversation behind a lead (owner only — both tables are RLS-scoped).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { data: lead } = await supabase.from("leads").select("bot_conversation_id").eq("id", id).maybeSingle<{ bot_conversation_id: string | null }>();
  if (!lead?.bot_conversation_id) return NextResponse.json({ transcript: [] });
  const { data: conv } = await supabase.from("bot_conversations").select("messages").eq("id", lead.bot_conversation_id).maybeSingle<{ messages: unknown[] }>();
  return NextResponse.json({ transcript: conv ? transcriptOf(conv.messages as Parameters<typeof transcriptOf>[0]) : [] });
}
