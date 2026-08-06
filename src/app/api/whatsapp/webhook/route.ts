import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = createServiceRoleClient();
  await supabase.from("whatsapp_webhook_events").insert({ payload: body });

  const messages: InboundMessage[] =
    body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

  if (messages.length > 0) {
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
