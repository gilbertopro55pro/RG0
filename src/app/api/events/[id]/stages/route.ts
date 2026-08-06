import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ALBUM_DESIGN_TEMPLATE,
  GENERIC_STAGE_UPDATE_TEMPLATE,
  STAGE_LABELS,
  STAGE_NOTIFY_CLIENT,
  STAGE_TEMPLATE_NAME,
  type StageKey,
} from "@/lib/stages";
import { friendlyWhatsAppError, sendWhatsAppDocumentTemplate, sendWhatsAppTemplate } from "@/lib/whatsapp";
import type { CustomPackageStageRow } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const {
    stageKey,
    customStageId,
    done,
    albumDesignPdfPath,
    albumDesignPdfFilename,
  }: {
    stageKey: StageKey | null;
    customStageId: string | null;
    done: boolean;
    albumDesignPdfPath?: string;
    albumDesignPdfFilename?: string;
  } = await request.json();

  if ((!stageKey && !customStageId) || typeof done !== "boolean") {
    return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
  }

  // Resolve label/notify/template info for either a built-in stage or a custom-package stage —
  // everything downstream works off these regardless of which kind this is.
  let label: string;
  let notifyText: string | null;
  let templateName: string | undefined;
  let requiresAlbumPdf: boolean;
  let customStage: CustomPackageStageRow | null = null;

  if (customStageId) {
    const { data } = await supabase
      .from("custom_package_stages")
      .select("*")
      .eq("id", customStageId)
      .single<CustomPackageStageRow>();
    if (!data) return NextResponse.json({ error: "השלב לא נמצא" }, { status: 404 });
    customStage = data;
    label = data.name;
    notifyText = data.notify_client ? (data.notify_text ?? data.name) : null;
    requiresAlbumPdf = data.requires_album_pdf;
  } else {
    label = STAGE_LABELS[stageKey!];
    notifyText = STAGE_NOTIFY_CLIENT[stageKey!] ?? null;
    templateName = STAGE_TEMPLATE_NAME[stageKey!];
    requiresAlbumPdf = stageKey === "album_approval";
  }

  if (requiresAlbumPdf && done && !albumDesignPdfPath) {
    return NextResponse.json({ error: "יש להעלות את קובץ עיצוב האלבום לפני סימון השלב כבוצע" }, { status: 400 });
  }

  const { data: stage, error: updateError } = await supabase
    .from("event_stages")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("event_id", eventId)
    .eq(customStageId ? "custom_stage_id" : "stage_key", customStageId ?? stageKey)
    .select()
    .single();

  if (updateError || !stage) {
    return NextResponse.json({ error: updateError?.message ?? "שגיאה בעדכון השלב" }, { status: 500 });
  }

  const notifications = [
    {
      event_id: eventId,
      text: done ? `שלב "${label}" סומן כבוצע` : `בוטל סימון "בוצע" לשלב "${label}"`,
    },
  ];

  if (requiresAlbumPdf && done && albumDesignPdfPath) {
    await supabase
      .from("events")
      .update({
        album_design_pdf_path: albumDesignPdfPath,
        album_design_pdf_filename: albumDesignPdfFilename ?? "album-design.pdf",
      })
      .eq("id", eventId);
  }

  const isAlbumSend = requiresAlbumPdf && done && !!albumDesignPdfPath;
  const shouldNotify = done && !!notifyText && (isAlbumSend || !!templateName || !!customStage);

  if (shouldNotify) {
    const { data: event } = await supabase
      .from("events")
      .select("client_name, client_phone")
      .eq("id", eventId)
      .single<{ client_name: string; client_phone: string | null }>();

    if (event?.client_phone) {
      try {
        if (isAlbumSend) {
          const { data: signed } = await supabase.storage
            .from("album-designs")
            .createSignedUrl(albumDesignPdfPath!, 3600, { download: albumDesignPdfFilename ?? "album-design.pdf" });
          if (!signed?.signedUrl) throw new Error("יצירת קישור לקובץ נכשלה");
          await sendWhatsAppDocumentTemplate(
            event.client_phone,
            ALBUM_DESIGN_TEMPLATE,
            signed.signedUrl,
            albumDesignPdfFilename ?? "album-design.pdf",
            [event.client_name]
          );
        } else if (customStage) {
          await sendWhatsAppTemplate(event.client_phone, GENERIC_STAGE_UPDATE_TEMPLATE, [event.client_name, label]);
        } else {
          await sendWhatsAppTemplate(event.client_phone, templateName!, [event.client_name]);
        }
        notifications.push({ event_id: eventId, text: `התראה נשלחה ללקוח בוואטסאפ: "${notifyText}"` });
      } catch (e) {
        const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
        notifications.push({ event_id: eventId, text: friendlyWhatsAppError(raw) });
      }
    } else {
      notifications.push({ event_id: eventId, text: "לא הוזן טלפון לקוח — לא נשלחה התראה" });
    }
  }

  await supabase.from("event_notifications").insert(notifications);

  return NextResponse.json({ stage });
}
