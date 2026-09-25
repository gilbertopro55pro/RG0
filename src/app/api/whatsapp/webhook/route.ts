import { NextResponse, after, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { verifyWhatsAppSignature } from "@/lib/whatsapp";
import { ingestWhatsAppChange, processWhatsAppConversation, type WaChangeValue } from "@/lib/whatsappIntake";

export const runtime = "nodejs";
// The intake assistant's reply runs after the 200 (Meta retries slow webhooks); a turn takes 5-10 s.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const body = JSON.parse(rawBody);
  const supabase = createServiceRoleClient();
  await supabase.from("whatsapp_webhook_events").insert({ payload: body });

  // Intake assistant on WhatsApp (lib/whatsappIntake.ts): only for a number set as a
  // photographer's whatsapp_bot_phone_number_id, admin only for now. Anything else is just logged.
  const siteUrl = new URL(request.url).origin;
  const changes: { value?: WaChangeValue }[] = (body?.entry ?? []).flatMap((e: { changes?: { value?: WaChangeValue }[] }) => e.changes ?? []);
  for (const change of changes) {
    if (!change.value) continue;
    try {
      const ingested = await ingestWhatsAppChange(supabase, change.value);
      if (!ingested) continue;
      for (const convId of ingested.conversationIds) {
        after(() =>
          processWhatsAppConversation(supabase, ingested.photographer, convId, siteUrl).catch((e) =>
            console.error("WhatsApp intake turn failed:", convId, e)
          )
        );
      }
    } catch (e) {
      console.error("WhatsApp intake ingest failed:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
