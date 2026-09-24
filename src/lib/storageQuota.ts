import { TRIAL_STORAGE_CAP_BYTES } from "@/lib/subscription";
import type { SubscriptionStatus } from "@/lib/types";
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
    .select("plan, subscription_status, trial_ends_at")
    .eq("id", photographerId)
    .maybeSingle<{ plan: SubscriptionPlan; subscription_status: SubscriptionStatus; trial_ends_at: string | null }>();
  // Missing photographer row isn't this function's problem to report — the caller's own
  // not-found/ownership check already covers it either before or right after this runs.
  if (!photographer) return { ok: true };

  // A free trial runs on Pro+ features but with its own small cap (TRIAL_STORAGE_CAP_BYTES).
  const cap = photographer.subscription_status === "trialing" && photographer.trial_ends_at
    ? TRIAL_STORAGE_CAP_BYTES
    : STORAGE_CAP_BYTES_BY_TIER[SUBSCRIPTION_PLANS[photographer.plan].tier];
  if (cap === null) return { ok: true };

  const { data: usedBytes } = await supabase.rpc("photographer_storage_bytes", { p_photographer_id: photographerId });
  if (Number(usedBytes ?? 0) >= cap) {
    return {
      ok: false,
      error: `הגעתם למכסת האחסון של המסלול (${formatGb(cap)}GB). כדי להמשיך להעלות קבצים יש לפנות מקום או לשדרג מסלול בהגדרות`,
    };
  }
  return { ok: true };
}
