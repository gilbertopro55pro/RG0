import type { SupabaseClient } from "@supabase/supabase-js";
import { SUBSCRIPTION_PLANS, STORAGE_CAP_BYTES_BY_TIER, type SubscriptionPlan } from "@/lib/stages";

function formatGb(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(0);
}

// Blocks starting a new upload once a capped tier's photographer has already reached their
// storage quota — checked at presigned-URL mint time (before any bytes are sent), the earliest
// point every upload path (the photographer's own, a client's, the desktop app's) can be stopped
// without letting the PUT to R2 happen and then having to notice/undo it after. Only the "basic"
// tier has a cap at all (see STORAGE_CAP_BYTES_BY_TIER) — everyone else short-circuits to ok
// without even querying usage.
export async function checkStorageQuota(
  supabase: SupabaseClient,
  photographerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: photographer } = await supabase
    .from("photographers")
    .select("plan")
    .eq("id", photographerId)
    .maybeSingle<{ plan: SubscriptionPlan }>();
  // Missing photographer row isn't this function's problem to report — the caller's own
  // not-found/ownership check already covers it either before or right after this runs.
  if (!photographer) return { ok: true };

  const cap = STORAGE_CAP_BYTES_BY_TIER[SUBSCRIPTION_PLANS[photographer.plan].tier];
  if (cap === null) return { ok: true };

  const { data: usedBytes } = await supabase.rpc("photographer_storage_bytes", { p_photographer_id: photographerId });
  if (Number(usedBytes ?? 0) >= cap) {
    return {
      ok: false,
      error: `הגעתם למכסת האחסון של המסלול (${formatGb(cap)}GB) — כדי להמשיך להעלות קבצים, יש לפנות מקום או לשדרג מסלול בהגדרות`,
    };
  }
  return { ok: true };
}
