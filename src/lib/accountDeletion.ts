import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import { removeAllObjectsOfOwner, removePreviewPrefixes } from "@/lib/storage";
import type { Photographer } from "@/lib/types";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

// Trial data retention (owner's decision, 2026-09-25): an account whose trial ended without a
// payment keeps its data for TRIAL_RETENTION_DAYS, is warned by email WARN_DAYS_BEFORE and 1 day
// before, and is then deleted — database rows (everything cascades from photographers → auth.users)
// and every stored file. Driven by the subscription-lifecycle cron.
export const TRIAL_RETENTION_DAYS = 30;
export const WARN_DAYS_BEFORE = 7;
const DAY_MS = 86_400_000;

export function trialDeletionDate(trialEndsAt: string): Date {
  return new Date(new Date(trialEndsAt).getTime() + TRIAL_RETENTION_DAYS * DAY_MS);
}

type RetentionFields = Pick<Photographer, "email" | "subscription_status" | "trial_ends_at" | "payplus_recurring_uid" | "keep_account">;

// The one definition of "may be auto-deleted": an ended trial that never became a subscription.
// Checked again right before deleting, so a payment that lands between the cron's query and the
// delete always wins.
export function isTrialDeletionCandidate(p: RetentionFields, now = new Date()): boolean {
  if (p.email === ADMIN_EMAIL || p.keep_account) return false;
  if (p.subscription_status !== "trialing" || !p.trial_ends_at) return false;
  if (p.payplus_recurring_uid) return false;
  return new Date(p.trial_ends_at).getTime() < now.getTime();
}

export async function deleteExpiredTrialAccount(supabase: ServiceClient, photographerId: string): Promise<{ deleted: boolean; reason?: string; objects?: number }> {
  const { data: p } = await supabase
    .from("photographers")
    .select("email, subscription_status, trial_ends_at, payplus_recurring_uid, keep_account, trial_deletion_final_warned_at")
    .eq("id", photographerId)
    .maybeSingle<RetentionFields & Pick<Photographer, "trial_deletion_final_warned_at">>();
  if (!p) return { deleted: false, reason: "not found" };
  if (!isTrialDeletionCandidate(p) || !p.trial_ends_at || !p.trial_deletion_final_warned_at) {
    return { deleted: false, reason: "not eligible" };
  }
  if (trialDeletionDate(p.trial_ends_at).getTime() > Date.now()) return { deleted: false, reason: "too early" };

  // Never delete an account that ever paid, whatever its status says now.
  const { count: charges } = await supabase
    .from("payplus_webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", photographerId)
    .eq("outcome", "charged");
  if ((charges ?? 0) > 0) return { deleted: false, reason: "has payments" };

  // Files first (the DB rows are what tell us where some of them live).
  const { data: galleries } = await supabase.from("galleries").select("id").eq("photographer_id", photographerId).returns<{ id: string }[]>();
  const galleryIds = (galleries ?? []).map((g) => g.id);
  const [exportsRes, zipsRes, spreadsRes] = await Promise.all([
    supabase.from("gallery_album_export_jobs").select("storage_path").eq("photographer_id", photographerId).not("storage_path", "is", null).returns<{ storage_path: string }[]>(),
    galleryIds.length
      ? supabase.from("gallery_zip_jobs").select("storage_path").in("gallery_id", galleryIds).not("storage_path", "is", null).returns<{ storage_path: string }[]>()
      : Promise.resolve({ data: [] as { storage_path: string }[] }),
    supabase.from("gallery_albums").select("gallery_album_spreads(preview_storage_path)").eq("photographer_id", photographerId).returns<{ gallery_album_spreads: { preview_storage_path: string | null }[] }[]>(),
  ]);
  const extraMainKeys = [
    ...(exportsRes.data ?? []).map((r) => `galleries/${r.storage_path}`),
    ...(zipsRes.data ?? []).map((r) => `galleries/${r.storage_path}`),
    ...(spreadsRes.data ?? []).flatMap((a) => a.gallery_album_spreads.map((s) => s.preview_storage_path)).filter((x): x is string => !!x).map((path) => `galleries/${path}`),
  ];
  const mainRemoved = await removeAllObjectsOfOwner(photographerId, extraMainKeys);
  const previewsRemoved = galleryIds.length ? await removePreviewPrefixes(galleryIds.map((id) => `previews/${id}/`)) : 0;

  // Deleting the auth user cascades to photographers and from there to every table.
  const { error } = await supabase.auth.admin.deleteUser(photographerId);
  if (error) throw new Error(`deleteUser failed for ${photographerId}: ${error.message}`);

  await supabase.from("deleted_accounts_log").insert({
    photographer_id: photographerId,
    reason: "trial_expired_unpaid",
    trial_ended_at: p.trial_ends_at,
    storage_objects_removed: mainRemoved + previewsRemoved,
  });
  return { deleted: true, objects: mainRemoved + previewsRemoved };
}
