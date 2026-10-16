import type { SupabaseClient } from "@supabase/supabase-js";

// Photo culling, round 0: the owner's hand labels (culling_labels, migrations 0178, 0180), the
// answers the engine is measured against. Shared by the labelling page (CullingLabeler) and the
// full-screen labelling screen (CullingLabelModal, also opened from a gallery).
//
// A photo is fine, or has one or more problems, or is skipped (not sure). In the table `label`
// keeps meaning focus and eyes (ok / blurry / eyes_closed / both / skip), and the two problems added
// later are flags beside it. labeled_v = 2 marks a label saved with all four problems on screen.

export type Label = "ok" | "blurry" | "eyes_closed" | "both" | "skip";

export type LabelFlags = { blurry: boolean; eyes: boolean; notLooking: boolean; unflattering: boolean };
export type PhotoLabel = { skip: boolean; flags: LabelFlags; v: number | null };
export type LabelRow = { photo_id: string; label: Label; unflattering: boolean; not_looking: boolean; labeled_v: number | null };

export const LABEL_VERSION = 2;
export const LABEL_COLUMNS = "photo_id, label, unflattering, not_looking, labeled_v";
export const NO_FLAGS: LabelFlags = { blurry: false, eyes: false, notLooking: false, unflattering: false };

// The problems, in the order of their buttons and keys (1 is "fine", 0 is skip).
export const FLAGS: { key: keyof LabelFlags; text: string; hotkey: string; hint: string }[] = [
  { key: "blurry", text: "לא בפוקוס", hotkey: "2", hint: "הדמות הראשית לא חדה, גם אם הרקע חד. גם תמונה מרוחה מתנועה." },
  { key: "eyes", text: "עיניים עצומות", hotkey: "3", hint: "פרצוף בולט בתמונה, לא ברקע, עם עיניים עצומות או חצי עצומות." },
  { key: "notLooking", text: "מבט לא למצלמה", hotkey: "4", hint: "תמונה מבוימת (משפחתית, קבוצתית, פורטרט) שמישהו בה לא מסתכל למצלמה. בתמונה ספונטנית לא מסמנים." },
  { key: "unflattering", text: "לא מחמיא", hint: "רגע שלא היית מוסר ללקוח: באמצע מילה או לעיסה, הבעה מעוותת, זווית לא מחמיאה.", hotkey: "5" },
];

export function fromRow(r: LabelRow): PhotoLabel {
  return {
    skip: r.label === "skip",
    flags: {
      blurry: r.label === "blurry" || r.label === "both",
      eyes: r.label === "eyes_closed" || r.label === "both",
      notLooking: r.not_looking,
      unflattering: r.unflattering,
    },
    v: r.labeled_v,
  };
}

export function toRow(l: PhotoLabel): { label: Label; unflattering: boolean; not_looking: boolean } {
  if (l.skip) return { label: "skip", unflattering: false, not_looking: false };
  const { blurry, eyes } = l.flags;
  return {
    label: blurry && eyes ? "both" : blurry ? "blurry" : eyes ? "eyes_closed" : "ok",
    unflattering: l.flags.unflattering,
    not_looking: l.flags.notLooking,
  };
}

export const hasFlags = (f: LabelFlags) => f.blurry || f.eyes || f.notLooking || f.unflattering;

// Done: labelled with all four problems on screen. The owner chose (2026-10-16) to label again from
// scratch once the two new problems were added, so a label from before (labeled_v null) counts as
// not labelled anywhere: it's shown again, empty, and the engine test ignores it.
export const isDone = (l: PhotoLabel | undefined) => !!l && l.v === LABEL_VERSION;

// What a label says, for the badge on the photo.
export function describe(l: PhotoLabel): string[] {
  if (l.skip) return ["דילוג"];
  const texts = FLAGS.filter((f) => l.flags[f.key]).map((f) => f.text);
  return texts.length ? texts : ["תקינה"];
}

export async function saveCullingLabel(
  supabase: SupabaseClient,
  row: { photoId: string; userId: string; galleryId: string; label: PhotoLabel }
): Promise<boolean> {
  const { error } = await supabase.from("culling_labels").upsert(
    {
      photo_id: row.photoId,
      photographer_id: row.userId,
      gallery_id: row.galleryId,
      ...toRow(row.label),
      labeled_v: LABEL_VERSION,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "photo_id" }
  );
  return !error;
}

// The next photo still to label after `from`, or simply the next one when the rest are done.
export function nextOpen(ids: string[], from: number, labels: Map<string, PhotoLabel>): number {
  for (let i = from + 1; i < ids.length; i++) if (!isDone(labels.get(ids[i]))) return i;
  return Math.min(from + 1, ids.length - 1);
}
