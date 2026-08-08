import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALBUM_DESIGN_TEMPLATE } from "@/lib/stages";
import { friendlyWhatsAppError, sendWhatsAppDocumentTemplate } from "@/lib/whatsapp";
import type { EventRow } from "@/lib/types";

// Attaching the album design PDF is deliberately separate from marking "אישור עיצוב אלבום" done —
// the file needs to reach the client (and the portal needs to offer the approve button) *before*
// the stage is complete, since it's the client who now confirms it via the portal. This just saves
// the file reference and notifies the client; it never touches event_stages.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { albumDesignPdfPath, albumDesignPdfFilename }: { albumDesignPdfPath: string; albumDesignPdfFilename: string } =
    await request.json();

  if (!albumDesignPdfPath) {
    return NextResponse.json({ error: "נתיב הקובץ חסר" }, { status: 400 });
  }

  // RLS (events_all_own) scopes this update to the owning photographer.
  const { data: event, error: updateError } = await supabase
    .from("events")
    .update({
      album_design_pdf_path: albumDesignPdfPath,
      album_design_pdf_filename: albumDesignPdfFilename ?? "album-design.pdf",
    })
    .eq("id", eventId)
    .select("client_name, client_phone")
    .single<Pick<EventRow, "client_name" | "client_phone">>();

  if (updateError || !event) {
    return NextResponse.json({ error: updateError?.message ?? "האירוע לא נמצא" }, { status: 404 });
  }

  const notifications: { event_id: string; text: string }[] = [];

  if (event.client_phone) {
    try {
      const { data: signed } = await supabase.storage
        .from("album-designs")
        .createSignedUrl(albumDesignPdfPath, 3600, { download: albumDesignPdfFilename ?? "album-design.pdf" });
      if (!signed?.signedUrl) throw new Error("יצירת קישור לקובץ נכשלה");
      await sendWhatsAppDocumentTemplate(
        event.client_phone,
        ALBUM_DESIGN_TEMPLATE,
        signed.signedUrl,
        albumDesignPdfFilename ?? "album-design.pdf",
        [event.client_name]
      );
      notifications.push({ event_id: eventId, text: "קובץ עיצוב האלבום הועלה ונשלח ללקוח בוואטסאפ — ממתינים לאישורו" });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
      notifications.push({ event_id: eventId, text: friendlyWhatsAppError(raw) });
    }
  } else {
    notifications.push({ event_id: eventId, text: "קובץ עיצוב האלבום הועלה — לא הוזן טלפון לקוח, לא נשלחה הודעה" });
  }

  await supabase.from("event_notifications").insert(notifications);

  return NextResponse.json({ ok: true });
}
