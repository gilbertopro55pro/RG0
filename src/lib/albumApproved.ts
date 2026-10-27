import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGE_LABELS } from "@/lib/stages";
import { stageRole } from "@/lib/clientReminders";
import { enqueuePrintHouseSend } from "@/lib/printHouseSend";
import { printSizeNote } from "@/lib/albumApproval";

// What the client's approval of the album design in the gallery sets off (owner, 2026-10-27),
// besides the album turning "approved" (api/gallery/[token]/album/approve): the event's album
// approval stage is marked done, the photographer hears of it (push and email), and the whole album
// goes to the print house by itself — JPG at the album's size, to the default print-house address
// of the album tool — unless switched off (photographers.album_auto_print). The home screen's event
// row then says "אלבום נשלח לדפוס בתאריך: …" once the send finishes, like any print send.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

// Marks the event's album approval stage done (the standard "אישור עיצוב אלבום", else a custom
// stage that reads as one), with a line in the event's log. Returns the stage's name, or null when
// there's none still open.
export async function markAlbumApprovalStageDone(supabase: Db, eventId: string): Promise<string | null> {
  const { data: stages } = await supabase
    .from("event_stages")
    .select("stage_key, custom_stage_id, done, stage_order")
    .eq("event_id", eventId)
    .order("stage_order", { ascending: true })
    .returns<{ stage_key: string | null; custom_stage_id: string | null; done: boolean; stage_order: number }[]>();
  const customIds = (stages ?? []).map((s) => s.custom_stage_id).filter((x): x is string => !!x);
  const { data: customs } = customIds.length
    ? await supabase.from("custom_package_stages").select("id, name, requires_album_pdf").in("id", customIds).returns<{ id: string; name: string; requires_album_pdf: boolean | null }[]>()
    : { data: [] as { id: string; name: string; requires_album_pdf: boolean | null }[] };
  const customById = new Map((customs ?? []).map((c) => [c.id, c]));
  const open = (stages ?? []).filter((s) => !s.done);
  const target =
    open.find((s) => s.stage_key === "album_approval") ??
    open.find((s) => s.custom_stage_id && stageRole(null, customById.get(s.custom_stage_id)) === "album_approval");
  if (!target) return null;

  const label = target.stage_key ? STAGE_LABELS[target.stage_key as keyof typeof STAGE_LABELS] ?? target.stage_key : customById.get(target.custom_stage_id as string)?.name ?? "";
  const { error } = await supabase
    .from("event_stages")
    .update({ done: true, done_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq(target.custom_stage_id ? "custom_stage_id" : "stage_key", target.custom_stage_id ?? target.stage_key);
  if (error) return null;
  await supabase.from("event_notifications").insert({ event_id: eventId, text: `שלב "${label}" סומן כבוצע אחרי אישור הלקוח/ה` });
  return label;
}

export type AutoPrintResult = { kind: "sent"; email: string } | { kind: "off" } | { kind: "no_print_house" } | { kind: "busy" } | { kind: "failed" };

// Sends the approved album to the print house by itself, unless the photographer switched it off.
export async function autoSendApprovedAlbum(
  supabase: Db,
  p: {
    galleryId: string;
    album: { id: string; width_cm: number | string; height_cm: number | string; cover_photo_id: string | null };
    photographerId: string;
    origin: string;
  }
): Promise<AutoPrintResult> {
  const [{ data: photographer }, { data: printHouses }, { data: pages }] = await Promise.all([
    supabase.from("photographers").select("album_auto_print").eq("id", p.photographerId).maybeSingle<{ album_auto_print: boolean | null }>(),
    supabase
      .from("print_house_emails")
      .select("email, is_default, created_at")
      .eq("photographer_id", p.photographerId)
      .order("created_at", { ascending: true })
      .returns<{ email: string; is_default: boolean; created_at: string }[]>(),
    supabase
      .from("gallery_album_spreads")
      .select("width_cm, height_cm")
      .eq("album_id", p.album.id)
      .order("sort_order", { ascending: true })
      .returns<{ width_cm: number | string | null; height_cm: number | string | null }[]>(),
  ]);
  if (photographer?.album_auto_print === false) return { kind: "off" };
  const printHouse = (printHouses ?? []).find((r) => r.is_default) ?? (printHouses ?? [])[0];
  if (!printHouse) return { kind: "no_print_house" };

  const result = await enqueuePrintHouseSend(supabase, {
    galleryId: p.galleryId,
    albumId: p.album.id,
    photographerId: p.photographerId,
    email: printHouse.email,
    notes: `${printSizeNote(p.album, pages ?? [])}\nהעיצוב אושר על ידי הלקוח/ה.`,
    // The whole album: the cover photo (when there is one) is page 1, then every spread.
    from: 1,
    to: Math.max(1, (p.album.cover_photo_id ? 1 : 0) + (pages ?? []).length),
    origin: p.origin,
  });
  if (result.ok) return { kind: "sent", email: printHouse.email };
  return { kind: result.reason === "busy" ? "busy" : "failed" };
}

// The event log's line for what happened with the print house (Hebrew, like every log line).
export function autoPrintLogLine(result: AutoPrintResult): string | null {
  switch (result.kind) {
    case "sent":
      return `האלבום נשלח לבית הדפוס (${result.email}) אחרי אישור הלקוח/ה`;
    case "no_print_house":
      return "האלבום לא נשלח לדפוס: אין כתובת שמורה של בית דפוס. אפשר לשלוח מכלי האלבום";
    case "busy":
      return "האלבום לא נשלח לדפוס: ייצוא אחר רץ באותו זמן. אפשר לשלוח מכלי האלבום";
    case "failed":
      return "השליחה האוטומטית לדפוס נכשלה. אפשר לשלוח מכלי האלבום";
    default:
      return null;
  }
}
