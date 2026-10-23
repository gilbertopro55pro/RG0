import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import { adminDeletionBlocker, purgePhotographerAccount, type AdminAccountPreview } from "@/lib/accountDeletion";
import type { Photographer } from "@/lib/types";

// Admin dashboard › "מחיקת חשבון" (owner's request, 2026-10-23: delete a test account with one
// click instead of SQL). GET shows what would go; DELETE removes it for good, the same way the
// 30-day trial cleanup does (lib/accountDeletion.ts). Refused for the admin, the QA accounts
// (keep_account), an account with a PayPlus recurring, or one that was ever charged
// (adminDeletionBlocker). DELETE needs the account's email typed back, so a stray click can't
// delete anything.

type AccountRow = Pick<Photographer, "id" | "name" | "email" | "plan" | "subscription_status" | "trial_ends_at" | "created_at" | "keep_account" | "payplus_recurring_uid">;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && user.email === ADMIN_EMAIL;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadAccount(db: ReturnType<typeof createServiceRoleClient>, id: string) {
  const { data: account } = await db
    .from("photographers")
    .select("id, name, email, plan, subscription_status, trial_ends_at, created_at, keep_account, payplus_recurring_uid")
    .eq("id", id)
    .maybeSingle<AccountRow>();
  if (!account) return null;
  // photographer_id is text in the webhook log.
  const { count: charges } = await db
    .from("payplus_webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", id)
    .eq("outcome", "charged");
  return { account, charges: charges ?? 0 };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "החשבון לא נמצא" }, { status: 404 });
  const db = createServiceRoleClient();
  const loaded = await loadAccount(db, id);
  if (!loaded) return NextResponse.json({ error: "החשבון לא נמצא" }, { status: 404 });
  const { account, charges } = loaded;

  const count = async (table: string) => {
    const { count: n } = await db.from(table).select("id", { count: "exact", head: true }).eq("photographer_id", id);
    return n ?? 0;
  };
  const { data: galleries } = await db.from("galleries").select("id").eq("photographer_id", id).returns<{ id: string }[]>();
  const galleryIds = (galleries ?? []).map((g) => g.id);
  const [events, leads, magnetFrames, teamMembers, photos] = await Promise.all([
    count("events"),
    count("leads"),
    count("magnet_frame_designs"),
    count("team_members"),
    galleryIds.length
      ? db.from("gallery_photos").select("id", { count: "exact", head: true }).in("gallery_id", galleryIds).then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  const preview: AdminAccountPreview = {
    id: account.id,
    name: account.name ?? "",
    email: account.email ?? "",
    plan: account.plan,
    status: account.subscription_status,
    createdAt: account.created_at,
    counts: { events, galleries: galleryIds.length, photos, leads, magnetFrames, teamMembers },
    charges,
    blocker: adminDeletionBlocker(account, charges),
  };
  return NextResponse.json({ account: preview });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "החשבון לא נמצא" }, { status: 404 });
  const { confirmEmail }: { confirmEmail?: unknown } = await request.json().catch(() => ({}));

  const db = createServiceRoleClient();
  const loaded = await loadAccount(db, id);
  if (!loaded) return NextResponse.json({ error: "החשבון לא נמצא" }, { status: 404 });
  const { account, charges } = loaded;

  // Checked again here, not only in the dialog: a payment can land in between.
  const blocker = adminDeletionBlocker(account, charges);
  if (blocker) return NextResponse.json({ error: "אי אפשר למחוק את החשבון הזה", blocker }, { status: 409 });
  if (typeof confirmEmail !== "string" || !account.email || confirmEmail.trim().toLowerCase() !== account.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "האימייל שהוקלד לא תואם לחשבון" }, { status: 400 });
  }

  try {
    const objects = await purgePhotographerAccount(db, id, { reason: "admin_deleted", trialEndedAt: account.trial_ends_at });
    return NextResponse.json({ deleted: true, objects });
  } catch (e) {
    console.error("[admin/accounts] delete failed", id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "המחיקה נכשלה" }, { status: 500 });
  }
}
