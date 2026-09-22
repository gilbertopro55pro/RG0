import type { SupabaseClient } from "@supabase/supabase-js";
import { PACKAGE_FLOWS, type PackageType } from "@/lib/stages";
import type { CustomPackageStageRow, EventStageRow } from "@/lib/types";

// Brings an existing event's stage list in line with a newly chosen package's flow: stages the new
// package also has keep their done state (just re-ordered), stages it lacks are removed (including
// completed ones — they no longer belong to this event's process), and stages it adds are appended
// as not-done. Inserts run first and deletes last, so a failure partway never leaves the event
// with FEWER stages than it started with. Returns a short Hebrew summary for the event timeline.
export async function reconcileEventStages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  eventId: string,
  newPkg: PackageType | null,
  customStages: CustomPackageStageRow[]
): Promise<string> {
  const desired: { identity: string; stage_key: string | null; custom_stage_id: string | null }[] = newPkg
    ? PACKAGE_FLOWS[newPkg].map((k) => ({ identity: k, stage_key: k as string | null, custom_stage_id: null }))
    : customStages.map((cs) => ({ identity: `custom:${cs.id}`, stage_key: null, custom_stage_id: cs.id as string | null }));

  const { data: existingStages, error: loadError } = await supabase
    .from("event_stages")
    .select("*")
    .eq("event_id", eventId)
    .returns<EventStageRow[]>();
  if (loadError) throw new Error(loadError.message);

  const identityOf = (s: Pick<EventStageRow, "stage_key" | "custom_stage_id">): string => s.stage_key ?? `custom:${s.custom_stage_id}`;
  const existingByIdentity = new Map<string, EventStageRow>((existingStages ?? []).map((s) => [identityOf(s), s]));
  const desiredIdentities = new Set(desired.map((d) => d.identity));

  const toInsert = desired
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => !existingByIdentity.has(d.identity))
    .map(({ d, i }) => ({ event_id: eventId, stage_key: d.stage_key, custom_stage_id: d.custom_stage_id, stage_order: i, done: false, done_at: null }));
  if (toInsert.length > 0) {
    const { error } = await supabase.from("event_stages").insert(toInsert);
    if (error) throw new Error(error.message);
  }

  for (const [i, d] of desired.entries()) {
    const row = existingByIdentity.get(d.identity);
    if (row && row.stage_order !== i) {
      const { error } = await supabase.from("event_stages").update({ stage_order: i }).eq("id", row.id);
      if (error) throw new Error(error.message);
    }
  }

  const toRemove = (existingStages ?? []).filter((s) => !desiredIdentities.has(identityOf(s)));
  if (toRemove.length > 0) {
    const { error } = await supabase.from("event_stages").delete().in("id", toRemove.map((s) => s.id));
    if (error) throw new Error(error.message);
  }

  return `נוספו ${toInsert.length} שלבים, הוסרו ${toRemove.length}`;
}
