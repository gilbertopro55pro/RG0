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

  const objects = await purgePhotographerAccount(supabase, photographerId, { reason: "trial_expired_unpaid", trialEndedAt: p.trial_ends_at });
  return { deleted: true, objects };
}

// Removes an account for good: every stored file, its team members' logins, then the auth user
// (which cascades to photographers and from there to every table), and a line in
// deleted_accounts_log (no personal data). Shared by the 30-day trial cleanup above and the admin
// dashboard's "מחיקת חשבון" (api/admin/accounts/[id]). The callers decide whether the account may
// go; this only removes it. Returns how many stored objects were removed.
export async function purgePhotographerAccount(
  supabase: ServiceClient,
  photographerId: string,
  log: { reason: string; trialEndedAt: string | null }
): Promise<number> {
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

  // Team members are logins of their own (team_members.id is their auth user): the cascade would
  // drop their membership but leave the login behind, so they go first.
  const { data: members } = await supabase.from("team_members").select("id").eq("photographer_id", photographerId).returns<{ id: string }[]>();
  for (const m of members ?? []) {
    const { error } = await supabase.auth.admin.deleteUser(m.id);
    if (error) throw new Error(`deleteUser failed for team member ${m.id}: ${error.message}`);
  }

  // Deleting the auth user cascades to photographers and from there to every table.
  const { error } = await supabase.auth.admin.deleteUser(photographerId);
  if (error) throw new Error(`deleteUser failed for ${photographerId}: ${error.message}`);

  await supabase.from("deleted_accounts_log").insert({
    photographer_id: photographerId,
    reason: log.reason,
    trial_ended_at: log.trialEndedAt,
    storage_objects_removed: mainRemoved + previewsRemoved,
  });
  return mainRemoved + previewsRemoved;
}

// Why the admin dashboard won't delete an account, or null when it may (owner's request,
// 2026-10-23: delete a test account with one click, after checking it has no recurring and no
// payments). A paying or once-paying account, a recurring that would keep charging after the
// account is gone (CLAUDE.md: cancel the recurring before deleting), the admin, and the QA accounts
// are left to a deliberate, manual decision.
export type AdminDeletionBlocker = "admin" | "keep_account" | "recurring" | "paid";

// What the admin dashboard's delete dialog shows (GET /api/admin/accounts/[id]).
export type AdminAccountPreview = {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  createdAt: string;
  counts: { events: number; galleries: number; photos: number; leads: number; magnetFrames: number; teamMembers: number };
  charges: number;
  blocker: AdminDeletionBlocker | null;
};

export function adminDeletionBlocker(
  p: Pick<Photographer, "email" | "keep_account" | "payplus_recurring_uid">,
  charges: number
): AdminDeletionBlocker | null {
  if (p.email === ADMIN_EMAIL) return "admin";
  if (p.keep_account) return "keep_account";
  if (p.payplus_recurring_uid) return "recurring";
  if (charges > 0) return "paid";
  return null;
}
