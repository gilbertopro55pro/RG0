import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadObject, getSignedDownloadUrl } from "@/lib/storage";
import { conversationPdf, conversationPdfName, studioName, type IntakeConversation, type IntakePhotographer } from "@/lib/intakeAssistant";

export const runtime = "nodejs";

// "שליחת סיכום השיחה בוואטסאפ" on a lead: builds the conversation PDF (the same one the handoff
// email attaches), uploads it and returns a signed link plus a ready message. A wa.me link can only
// carry text, so the client gets a download link, same pattern as a price quote sent on WhatsApp.
// Owner only: the lead and conversation reads are RLS-scoped to the signed-in photographer.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, bot_conversation_id")
    .eq("id", id)
    .maybeSingle<{ id: string; name: string | null; phone: string | null; bot_conversation_id: string | null }>();
  if (!lead?.bot_conversation_id) return NextResponse.json({ error: "אין שיחה עם העוזר לליד הזה" }, { status: 404 });

  const [{ data: conv }, { data: photographer }] = await Promise.all([
    supabase.from("bot_conversations").select("collected, messages").eq("id", lead.bot_conversation_id).maybeSingle<Pick<IntakeConversation, "collected" | "messages">>(),
    supabase.from("photographers").select("*").eq("id", user.id).maybeSingle<IntakePhotographer>(),
  ]);
  if (!conv || !photographer) return NextResponse.json({ error: "השיחה לא נמצאה" }, { status: 404 });

  const details = { ...conv.collected, clientName: conv.collected?.clientName || lead.name || undefined };
  const pdf = await conversationPdf(photographer, details, conv.messages ?? []);
  if (!pdf) return NextResponse.json({ error: "אין הודעות בשיחה" }, { status: 404 });

  const path = `${user.id}/conversation-${lead.id}-${Date.now()}.pdf`;
  await uploadObject("price-quotes", path, Buffer.from(pdf), "application/pdf");
  const url = await getSignedDownloadUrl("price-quotes", path, 60 * 60 * 24 * 7, conversationPdfName(details));
  const first = (details.clientName ?? "").trim().split(/\s+/)[0];
  const message = `${first ? `היי ${first}, ` : "היי, "}מצורף סיכום השיחה שלנו עם כל פרטי האירוע:\n${url}\n\n${studioName(photographer)}`;
  return NextResponse.json({ url, message, phone: lead.phone ?? details.phone ?? null });
}
