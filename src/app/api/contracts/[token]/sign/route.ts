import { NextResponse } from "next/server";
import { sendPushToPhotographer } from "@/lib/push";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { packageLabel } from "@/lib/stages";
import type { EventContractRow, EventRow, Photographer } from "@/lib/types";
import { photographerLang } from "@/lib/clientLang";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { signerName, signatureDataUrl }: { signerName: string; signatureDataUrl?: string } = await request.json();

  if (!signerName?.trim()) {
    return NextResponse.json({ error: "יש להקליד שם מלא" }, { status: 400 });
  }
  if (!signatureDataUrl?.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "יש לחתום בשדה החתימה" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: contract } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("sign_token", token)
    .maybeSingle<EventContractRow>();

  if (!contract) {
    return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });
  }
  if (contract.status === "signed") {
    return NextResponse.json({ error: "החוזה כבר נחתם" }, { status: 400 });
  }

  const signerIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "לא ידוע";

  const { data: updated, error } = await supabase
    .from("event_contracts")
    .update({
      status: "signed",
      signer_name: signerName.trim(),
      signer_ip: signerIp,
      signed_at: new Date().toISOString(),
      signature_data_url: signatureDataUrl,
    })
    .eq("id", contract.id)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בחתימת החוזה" }, { status: 500 });
  }

  await supabase.from("event_notifications").insert({
    event_id: contract.event_id,
    text: `החוזה נחתם על ידי ${signerName.trim()}`,
    is_client_action: true,
  });

  // event_closing stays open for every photographer (lib/createEvent.ts) until either this happens
  // (contract signed) or the photographer sends the opening WhatsApp message manually
  // (EventDetailView.tsx's event-closing banner). A signed contract is unambiguous proof the booking
  // is real, so it marks the stage done outright and emails the photographer (all accounts since
  // 2026-10-01; it was admin only).
  const { data: event } = await supabase
    .from("events")
    .select("*, custom_packages(name)")
    .eq("id", contract.event_id)
    .maybeSingle<EventRow & { custom_packages: { name: string } | null }>();
  if (event) {
    // Push and email go to the photographer, in their own language (photographers.ui_lang).
    const { data: photographer } = await supabase
      .from("photographers")
      .select("*")
      .eq("id", event.photographer_id)
      .maybeSingle<Photographer>();
    const lang = photographerLang(photographer?.ui_lang);
    const t = makeT(messagesFor(lang));
    const eventDateStr = new Date(event.event_date).toLocaleDateString(dateLocale(lang));
    await sendPushToPhotographer(event.photographer_id, {
      title: t("{name} חתמו על החוזה", { name: event.client_name }),
      body: t("האירוע ב-{date}. לחצו לפתיחת האירוע", { date: eventDateStr }),
      url: `/events/${event.id}`,
      tag: `contract-${event.id}`,
    });
    if (photographer) {
      await supabase
        .from("event_stages")
        .update({ done: true, done_at: new Date().toISOString() })
        .eq("event_id", event.id)
        .eq("stage_key", "event_closing")
        .eq("done", false);

      const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://myframeflow.com"}/events/${event.id}`;
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        subject: t("החוזה עם {name} נחתם", { name: event.client_name }),
        text:
          `${t("שלום {name},", { name: photographer.name })}\n\n` +
          `${t("החוזה עבור האירוע של {name} נחתם דיגיטלית על ידי {signer}.", { name: event.client_name, signer: signerName.trim() })}\n\n` +
          `${t("פרטי האירוע:")}\n` +
          `${t("תאריך: {v}", { v: eventDateStr })}\n` +
          `${t("מיקום: {v}", { v: event.event_location || t("יעודכן") })}\n` +
          `${t("חבילה: {v}", { v: t(packageLabel(event.package, event.custom_packages?.name)) })}\n` +
          `${t("טלפון הלקוח/ה: {v}", { v: event.client_phone || t("לא הוזן") })}\n\n` +
          `${t("מעבר לעמוד האירוע לשליחת הודעת פתיחה ללקוח/ה:")}\n${eventUrl}`,
      }).catch((e) => console.error("Contract-signed email failed:", e));
    }
  }

  return NextResponse.json({ contract: updated });
}
