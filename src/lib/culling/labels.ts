import type { SupabaseClient } from "@supabase/supabase-js";

// Photo culling, round 0: the owner's hand labels (culling_labels, migration 0178), the answers the
// engine is measured against. Shared by the labelling page (CullingLabeler) and the full-screen
// labelling from a gallery (CullingLabelModal), so both save the same way.

export type Label = "ok" | "blurry" | "eyes_closed" | "both" | "skip";

export const LABELS: { key: Label; text: string; hotkey: string }[] = [
  { key: "ok", text: "תקינה", hotkey: "1" },
  { key: "blurry", text: "לא בפוקוס", hotkey: "2" },
  { key: "eyes_closed", text: "עיניים עצומות", hotkey: "3" },
  { key: "both", text: "גם וגם", hotkey: "4" },
  { key: "skip", text: "דילוג", hotkey: "0" },
];

export const labelText = (l: Label) => LABELS.find((x) => x.key === l)!.text;

export async function saveCullingLabel(
  supabase: SupabaseClient,
  row: { photoId: string; userId: string; galleryId: string; label: Label }
): Promise<boolean> {
  const { error } = await supabase.from("culling_labels").upsert(
    { photo_id: row.photoId, photographer_id: row.userId, gallery_id: row.galleryId, label: row.label, updated_at: new Date().toISOString() },
    { onConflict: "photo_id" }
  );
  return !error;
}

// The next photo without a label after `from`, or simply the next one when the rest are labelled.
export function nextUnlabelled(ids: string[], from: number, labels: Map<string, Label>): number {
  for (let i = from + 1; i < ids.length; i++) if (!labels.has(ids[i])) return i;
  return Math.min(from + 1, ids.length - 1);
}
