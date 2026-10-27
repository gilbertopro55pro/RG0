import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, STAGE_NOTIFY_CLIENT, type StageKey } from "@/lib/stages";
import { getSignedDownloadUrl } from "@/lib/storage";
import { shortFileUrl } from "@/lib/shortFileLinks";
import type { CustomPackageStageRow } from "@/lib/types";
import { stageMarkNotifies } from "@/lib/albumStageMark";

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

  // Resolve label/notify info for either a built-in stage or a custom-package stage — everything
  // downstream works off these regardless of which kind this is.
  let label: string;
  let notifyText: string | null;
  let requiresAlbumPdf: boolean;

  if (customStageId) {
    const { data } = await supabase
      .from("custom_package_stages")
      .select("*")
      .eq("id", customStageId)
      .single<CustomPackageStageRow>();
    if (!data) return NextResponse.json({ error: "השלב לא נמצא" }, { status: 404 });
    label = data.name;
    notifyText = data.notify_client ? (data.notify_text ?? data.name) : null;
    requiresAlbumPdf = data.requires_album_pdf;
  } else {
    label = STAGE_LABELS[stageKey!];
    notifyText = STAGE_NOTIFY_CLIENT[stageKey!] ?? null;
    requiresAlbumPdf = stageKey === "album_approval";
  }

  // A stage that takes the album-design PDF can be marked by hand without one (owner, 2026-10-27);
  // see lib/albumStageMark.ts for what that means for the client update.
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
  // Every client-facing stage notifies on completion, except the standard "אישור עיצוב אלבום" (its
  // PDF and message go out on upload) and an album stage marked without a file (lib/albumStageMark.ts).
  const isStandardAlbumApproval = !customStageId && stageKey === "album_approval";
  const shouldNotify = stageMarkNotifies({
    done,
    hasNotifyText: !!notifyText,
    requiresAlbumPdf,
    hasPdfInRequest: !!albumDesignPdfPath,
    isStandardAlbumApproval,
  });

  // The actual WhatsApp send happens client-side (a wa.me deep link the photographer confirms
  // themselves — see EventDetailView.tsx's setStageDone and src/lib/waLink.ts), the same
  // no-Business-API-template approach used for the initial booking confirmation. This route's job
  // is just to say WHAT to send and hand back a download link when the update carries a file —
  // wa.me can pre-fill text but can't attach a file, so the link goes in the message body instead.
  let notify: { text: string; downloadUrl: string | null } | null = null;

  if (shouldNotify) {
    const { data: event } = await supabase
      .from("events")
      .select("client_name, client_phone")
      .eq("id", eventId)
      .single<{ client_name: string; client_phone: string | null }>();

    if (event?.client_phone) {
      let downloadUrl: string | null = null;
      if (isAlbumSend) {
        const filename = albumDesignPdfFilename ?? "album-design.pdf";
        const ttl = 60 * 60 * 24 * 7;
        downloadUrl = await shortFileUrl(
          { bucket: "album-designs", path: albumDesignPdfPath!, filename, photographerId: user.id, ttlSeconds: ttl },
          () => getSignedDownloadUrl("album-designs", albumDesignPdfPath!, ttl, filename),
        );
      }
      notify = { text: notifyText!, downloadUrl };
    } else {
      notifications.push({ event_id: eventId, text: "לא הוזן טלפון לקוח. לא נשלחה התראה" });
    }
  }

  await supabase.from("event_notifications").insert(notifications);

  return NextResponse.json({ stage, notify });
}
