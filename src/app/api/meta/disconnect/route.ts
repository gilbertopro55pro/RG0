import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { campaignsAllowed } from "@/lib/campaignsAccess";
import { metaStatus } from "@/lib/metaAds";

// Disconnects the Meta ad account (lib/metaAds.ts): the token is deleted. Spend already synced stays,
// as it was real money spent; it can be edited by hand from now on.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !campaignsAllowed(user.email)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const service = createServiceRoleClient();
  const { error } = await service.from("meta_ad_connections").delete().eq("photographer_id", user.id);
  if (error) return NextResponse.json({ error: "הניתוק נכשל" }, { status: 500 });
  await service.from("ad_spend").update({ source: "manual" }).eq("photographer_id", user.id).eq("source", "meta");
  return NextResponse.json({ status: await metaStatus(service, user.id) });
}
