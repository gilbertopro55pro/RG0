import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedDownloadUrl } from "@/lib/storage";
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

  // The actual WhatsApp send happens client-side (a wa.me deep link the photographer confirms
  // themselves — see EventDetailView.tsx's uploadAlbumDesign and src/lib/waLink.ts), same as the
  // rest of the client-update flow. wa.me can't attach a file, so the signed download link travels
  // in the message text instead of a document header.
  let notify: { text: string; downloadUrl: string } | null = null;

  if (event.client_phone) {
    const signedUrl = await getSignedDownloadUrl(
      "album-designs",
      albumDesignPdfPath,
      60 * 60 * 24 * 7,
      albumDesignPdfFilename ?? "album-design.pdf"
    );
    if (signedUrl) {
      notify = { text: "עיצוב האלבום מוכן לאישור", downloadUrl: signedUrl };
    } else {
      await supabase
        .from("event_notifications")
        .insert({ event_id: eventId, text: "קובץ עיצוב האלבום הועלה, אבל יצירת קישור לשליחה נכשלה" });
    }
  } else {
    await supabase
      .from("event_notifications")
      .insert({ event_id: eventId, text: "קובץ עיצוב האלבום הועלה — לא הוזן טלפון לקוח, לא נשלחה הודעה" });
  }

  return NextResponse.json({ ok: true, notify });
}
