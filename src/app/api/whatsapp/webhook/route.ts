import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendWhatsAppMessage, verifyWhatsAppSignature } from "@/lib/whatsapp";
import { getOrCreateConversation, runBotTurn } from "@/lib/whatsappBot";
import type { Photographer } from "@/lib/types";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type InboundMessage = { from: string; type: string; text?: { body: string } };

// Paused pending Meta's approval of the message templates the bot's free-text replies rely on,
// and until it sits behind the planned paid add-on (to cover the per-conversation Claude API
// cost) rather than every photographer's base plan. Flip to true once both are in place — the
// per-photographer whatsapp_bot_enabled toggle is intentionally not enough on its own to bring
// this back, so it can't turn back on by accident from a stray DB value.
const BOT_LIVE = false;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const body = JSON.parse(rawBody);
  const supabase = createServiceRoleClient();
  await supabase.from("whatsapp_webhook_events").insert({ payload: body });

  const messages: InboundMessage[] =
    body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

  if (BOT_LIVE && messages.length > 0) {
    // Single shared WhatsApp Business number for now (no per-photographer WABA routing yet) —
    // the bot only ever answers for whichever photographer has explicitly opted in.
    const { data: photographer } = await supabase
      .from("photographers")
      .select("*")
      .eq("whatsapp_bot_enabled", true)
      .limit(1)
      .maybeSingle<Photographer>();

    if (photographer) {
      for (const message of messages) {
        if (message.type !== "text" || !message.text?.body) continue;
        try {
          const conversation = await getOrCreateConversation(supabase, photographer.id, message.from);
          const reply = await runBotTurn(supabase, conversation, photographer.name, message.text.body);
          if (reply) await sendWhatsAppMessage(message.from, reply);
        } catch (e) {
          console.error("WhatsApp bot turn failed:", e);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
