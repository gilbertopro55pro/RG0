import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { STAGE_LABELS, type StageKey } from "@/lib/stages";
import { stageRole } from "@/lib/clientReminders";
import { clipNotesLogText, clipNotesPushPreview, packageHasClip, parseClipNotes, type ClipNotesFields } from "@/lib/clipNotes";
import { sendPushToPhotographer } from "@/lib/push";
import { photographerLang } from "@/lib/clientLang";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// The client's notes for the clip, from the portal (owner, 2026-10-25; lib/clipNotes.ts). Only in a
// package with a clip. An empty text clears them. A log line on the event, marked as the client's
// own action (the event list's badge until the photographer opens the event), and a phone
// notification with the notes when they're written or changed (owner, 2026-10-26). No email.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as { notes?: unknown } | null;
  const notes = parseClipNotes(body?.notes);
  if (notes === null) return NextResponse.json({ error: "לא הצלחנו לשמור. נסו שוב." }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, client_name, custom_package_id, photographer_id, clip_notes, clip_notes_at, event_stages(stage_key, custom_stage_id), photographers(ui_lang)")
    .eq("client_access_token", token)
    .maybeSingle<
      {
        id: string;
        client_name: string;
        custom_package_id: string | null;
        photographer_id: string;
        event_stages: { stage_key: string | null; custom_stage_id: string | null }[];
        photographers: { ui_lang: string | null } | null;
      } & ClipNotesFields
    >();
  if (!event) return NextResponse.json({ error: "הקישור שגוי או שפג תוקפו" }, { status: 404 });

  const customIds = event.event_stages.map((s) => s.custom_stage_id).filter((id): id is string => !!id);
  const { data: customs } = customIds.length
    ? await supabase.from("custom_package_stages").select("id, name, requires_album_pdf").in("id", customIds).returns<{ id: string; name: string; requires_album_pdf: boolean | null }[]>()
    : { data: [] as { id: string; name: string; requires_album_pdf: boolean | null }[] };
  const customById = new Map((customs ?? []).map((c) => [c.id, c]));
  const stages = event.event_stages.flatMap((s) => {
    if (s.stage_key) return [{ role: stageRole(s.stage_key), label: STAGE_LABELS[s.stage_key as StageKey] ?? s.stage_key }];
    const cs = customById.get(s.custom_stage_id ?? "");
    return cs ? [{ role: stageRole(null, cs), label: cs.name }] : [];
  });
  if (!packageHasClip(stages)) return NextResponse.json({ error: "אין קליפ בחבילה הזו" }, { status: 400 });

  const before = event.clip_notes ?? null;
  if ((before ?? "") === notes) return NextResponse.json({ ok: true, notes: before, at: event.clip_notes_at });

  const at = new Date().toISOString();
  const { error } = await supabase
    .from("events")
    .update({ clip_notes: notes || null, clip_notes_at: notes ? at : null })
    .eq("id", event.id);
  if (error) return NextResponse.json({ error: "לא הצלחנו לשמור. נסו שוב." }, { status: 500 });

  await supabase.from("event_notifications").insert({
    event_id: event.id,
    text: clipNotesLogText(event.client_name, before, notes),
    is_client_action: true,
  });
  // One notification per event: a second save replaces the first on the phone (tag).
  if (notes) {
    const t = makeT(messagesFor(photographerLang(event.photographers?.ui_lang)));
    await sendPushToPhotographer(event.photographer_id, {
      title: before ? t("{name} עדכנו את ההערות לקליפ", { name: event.client_name }) : t("{name} כתבו הערות לקליפ", { name: event.client_name }),
      body: clipNotesPushPreview(notes),
      url: `/events/${event.id}#stages`,
      tag: `clip-notes-${event.id}`,
    });
  }
  return NextResponse.json({ ok: true, notes: notes || null, at: notes ? at : null });
}
