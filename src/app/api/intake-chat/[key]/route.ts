import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { resolveChatPhotographer, assistantUnavailableReason } from "@/lib/intakeChatAccess";
import { runIntakeTurn, transcriptOf, MAX_CLIENT_TURNS, MAX_MESSAGE_CHARS, studioName, type IntakeConversation } from "@/lib/intakeAssistant";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadConversation(supabase: ReturnType<typeof createServiceRoleClient>, photographerId: string, token: string | null) {
  if (!token || !UUID_RE.test(token)) return null;
  const { data } = await supabase
    .from("bot_conversations")
    .select("id, photographer_id, state, collected, messages, lead_id, client_turns, session_token, completed_at")
    .eq("session_token", token)
    .eq("photographer_id", photographerId)
    .eq("channel", "web")
    .maybeSingle<IntakeConversation>();
  return data ?? null;
}

// Page bootstrap: is the assistant available, and the transcript of an existing session.
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const supabase = createServiceRoleClient();
  const p = await resolveChatPhotographer(supabase, key);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const conv = await loadConversation(supabase, p.id, request.nextUrl.searchParams.get("session"));
  const unavailable = conv ? null : await assistantUnavailableReason(supabase, p);
  return NextResponse.json({
    studio: studioName(p),
    available: !unavailable,
    transcript: conv ? transcriptOf(conv.messages) : [],
    state: conv?.state ?? null,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ip = clientIpFrom(request);
  const { allowed } = await checkRateLimit(`intake-msg:${ip}`, { maxRequests: 40, windowSeconds: 600 });
  if (!allowed) return NextResponse.json({ error: "יותר מדי הודעות. נסו שוב בעוד כמה דקות" }, { status: 429 });

  const body: { session?: string; message?: string } = await request.json().catch(() => ({}));
  const text = (body.message ?? "").trim();
  if (!text) return NextResponse.json({ error: "הודעה ריקה" }, { status: 400 });
  if (text.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: "ההודעה ארוכה מדי" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const p = await resolveChatPhotographer(supabase, key);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  let conv = await loadConversation(supabase, p.id, body.session ?? null);
  if (!conv) {
    // A new conversation counts toward the photographer's monthly cap and the per-IP daily limit.
    const reason = await assistantUnavailableReason(supabase, p);
    if (reason) return NextResponse.json({ unavailable: reason }, { status: 409 });
    const { allowed: newAllowed } = await checkRateLimit(`intake-new:${ip}`, { maxRequests: 6, windowSeconds: 86_400 });
    if (!newAllowed) return NextResponse.json({ error: "יותר מדי שיחות חדשות מהמכשיר הזה היום" }, { status: 429 });
    const { data: created, error } = await supabase
      .from("bot_conversations")
      .insert({ photographer_id: p.id, channel: "web", client_phone: null })
      .select("id, photographer_id, state, collected, messages, lead_id, client_turns, session_token, completed_at")
      .single<IntakeConversation>();
    if (error || !created) return NextResponse.json({ error: "שגיאה בפתיחת השיחה" }, { status: 500 });
    conv = created;
  }
  if (conv.client_turns >= MAX_CLIENT_TURNS) {
    return NextResponse.json({ session: conv.session_token, reply: `השיחה ארוכה מדי בשבילי. ${studioName(p)} יחזור אליך בהקדם עם כל מה שכבר כתבת.`, state: conv.state });
  }

  const origin = new URL(request.url).origin;
  const reply = await runIntakeTurn(supabase, conv, p, text, origin);
  await supabase
    .from("bot_conversations")
    .update({
      messages: conv.messages,
      collected: conv.collected,
      state: conv.state,
      lead_id: conv.lead_id,
      client_turns: conv.client_turns + 1,
      completed_at: conv.completed_at,
      client_phone: conv.collected.phone ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conv.id);

  return NextResponse.json({ session: conv.session_token, reply, state: conv.state });
}
