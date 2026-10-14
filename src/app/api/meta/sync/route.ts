import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { campaignsAllowed } from "@/lib/campaignsAccess";
import { SPEND_COLUMNS, type AdSpendRow } from "@/lib/campaigns";
import { metaStatus, syncMetaSpend } from "@/lib/metaAds";

// Pulls the connected ad account's spend again (lib/metaAds.ts): "עדכון מהמטא" on /leads/campaigns,
// and on opening the page when the last sync is a few hours old. → { status, spend, syncError }.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !campaignsAllowed(user.email)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const service = createServiceRoleClient();
  let syncError: string | null = null;
  await syncMetaSpend(service, user.id).catch((e) => (syncError = e instanceof Error ? e.message : String(e)));
  const { data: spend } = await supabase.from("ad_spend").select(SPEND_COLUMNS).eq("photographer_id", user.id).returns<AdSpendRow[]>();
  return NextResponse.json({ status: await metaStatus(service, user.id), spend: spend ?? [], syncError });
}
