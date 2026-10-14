import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { campaignsAllowed } from "@/lib/campaignsAccess";
import { SPEND_COLUMNS, type AdSpendRow } from "@/lib/campaigns";
import { loadConnection, metaStatus, syncMetaSpend } from "@/lib/metaAds";

// Picks which of the connected Meta ad accounts to sync (lib/metaAds.ts), then syncs it.
// POST { accountId } → { status, spend } (the photographer's spend rows after the sync).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !campaignsAllowed(user.email)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { accountId?: unknown } | null;
  const service = createServiceRoleClient();
  const c = await loadConnection(service, user.id);
  const account = c?.ad_accounts?.find((a) => a.id === body?.accountId);
  if (!c || !account) return NextResponse.json({ error: "חשבון המודעות לא נמצא" }, { status: 400 });

  await service
    .from("meta_ad_connections")
    .update({ ad_account_id: account.id, ad_account_name: account.name, currency: account.currency })
    .eq("photographer_id", user.id);
  let syncError: string | null = null;
  await syncMetaSpend(service, user.id).catch((e) => (syncError = e instanceof Error ? e.message : String(e)));
  const { data: spend } = await supabase.from("ad_spend").select(SPEND_COLUMNS).eq("photographer_id", user.id).returns<AdSpendRow[]>();
  return NextResponse.json({ status: await metaStatus(service, user.id), spend: spend ?? [], syncError });
}
