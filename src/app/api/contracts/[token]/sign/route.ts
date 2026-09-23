import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import { ADMIN_EMAIL } from "@/lib/admin";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { packageLabel } from "@/lib/stages";
import type { EventContractRow, EventRow, Photographer } from "@/lib/types";

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
    text: `החוזה נחתם על ידי ${signerName.trim()} ✓`,
    is_client_action: true,
  });

  // Admin-only for now (see the standing "עדכון אדמין" staged-rollout process): event_closing
  // stays open (not the auto-done-at-creation behavior every other photographer still gets — see
  // /api/events/route.ts) until either this happens (contract signed) or the photographer sends
  // the opening WhatsApp message manually (EventDetailView.tsx's event-closing banner). A signed
  // contract is unambiguous proof the booking is real, so it marks the stage done outright.
  const { data: event } = await supabase
    .from("events")
    .select("*, custom_packages(name)")
    .eq("id", contract.event_id)
    .maybeSingle<EventRow & { custom_packages: { name: string } | null }>();
  if (event) {
    const { data: photographer } = await supabase
      .from("photographers")
      .select("*")
      .eq("id", event.photographer_id)
      .maybeSingle<Photographer>();
    if (photographer?.email === ADMIN_EMAIL) {
      await supabase
        .from("event_stages")
        .update({ done: true, done_at: new Date().toISOString() })
        .eq("event_id", event.id)
        .eq("stage_key", "event_closing")
        .eq("done", false);

      const eventDateStr = new Date(event.event_date).toLocaleDateString("he-IL");
      const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://myframeflow.com"}/events/${event.id}`;
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        subject: `החוזה עם ${event.client_name} נחתם ✓`,
        text: `שלום ${photographer.name},

החוזה עבור האירוע של ${event.client_name} נחתם דיגיטלית על ידי ${signerName.trim()}.

פרטי האירוע:
תאריך: ${eventDateStr}
מיקום: ${event.event_location || "יעודכן"}
חבילה: ${packageLabel(event.package, event.custom_packages?.name)}
טלפון הלקוח/ה: ${event.client_phone || "לא הוזן"}

מעבר לעמוד האירוע לשליחת הודעת פתיחה ללקוח/ה:
${eventUrl}`,
      }).catch((e) => console.error("Contract-signed email failed:", e));
    }
  }

  return NextResponse.json({ contract: updated });
}
