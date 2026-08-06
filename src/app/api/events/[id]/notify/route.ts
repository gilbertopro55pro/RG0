import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_STAGE_UPDATE_TEMPLATE, STAGE_LABELS, STAGE_TEMPLATE_NAME, type StageKey } from "@/lib/stages";
import { friendlyWhatsAppError, sendWhatsAppTemplate } from "@/lib/whatsapp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { stageKey, customStageId }: { stageKey: StageKey | null; customStageId: string | null } =
    await request.json();
  if (!stageKey && !customStageId) {
    return NextResponse.json({ error: "שדה stageKey חסר" }, { status: 400 });
  }

  let label: string;
  let templateName: string | undefined;
  if (customStageId) {
    const { data: customStage } = await supabase
      .from("custom_package_stages")
      .select("name")
      .eq("id", customStageId)
      .single<{ name: string }>();
    if (!customStage) return NextResponse.json({ error: "השלב לא נמצא" }, { status: 404 });
    label = customStage.name;
  } else {
    label = STAGE_LABELS[stageKey!];
    templateName = STAGE_TEMPLATE_NAME[stageKey!];
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_name, client_phone")
    .eq("id", eventId)
    .single<{ client_name: string; client_phone: string | null }>();

  if (!event?.client_phone) {
    const text = "לא הוזן טלפון לקוח — לא נשלחה הודעת עדכון";
    await supabase.from("event_notifications").insert({ event_id: eventId, text });
    return NextResponse.json({ error: text }, { status: 400 });
  }

  const templateParams = templateName ? [event.client_name] : [event.client_name, label];

  try {
    await sendWhatsAppTemplate(event.client_phone, templateName ?? GENERIC_STAGE_UPDATE_TEMPLATE, templateParams);
    await supabase.from("event_notifications").insert({
      event_id: eventId,
      text: `נשלחה הודעת וואטסאפ ל-${event.client_phone} בנוגע לשלב "${label}"`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
    const errorText = friendlyWhatsAppError(raw);
    await supabase.from("event_notifications").insert({ event_id: eventId, text: errorText });
    return NextResponse.json({ error: errorText }, { status: 500 });
  }
}
