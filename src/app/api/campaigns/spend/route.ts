import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { cleanCampaignName } from "@/lib/campaigns";
import { campaignsAllowed } from "@/lib/campaignsAccess";
import { getT } from "@/i18n/server";

// What the photographer spent on a campaign in a month (owner, 2026-10-14; /leads/campaigns,
// migration 0172). POST { month: "YYYY-MM", campaign, amount }: campaign "" is the ads that came
// without a campaign name; amount null or 0 removes the entry. ad_spend has no write policy, so the
// write goes through the service role, always scoped to the signed-in photographer. A locked account
// never gets here: the proxy answers API writes with 402 (lib/appAccess.ts).

const MAX_AMOUNT = 10_000_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const t = await getT();
  if (!user) return NextResponse.json({ error: t("יש להתחבר מחדש") }, { status: 401 });
  if (!campaignsAllowed(user.email)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { month?: unknown; campaign?: unknown; amount?: unknown } | null;

  const month = typeof body?.month === "string" ? body.month : "";
  const monthNum = Number(month.slice(5, 7));
  if (!/^\d{4}-\d{2}$/.test(month) || monthNum < 1 || monthNum > 12) {
    return NextResponse.json({ error: t("חודש לא תקין") }, { status: 400 });
  }

  const rawCampaign = typeof body?.campaign === "string" ? body.campaign : null;
  const campaign = rawCampaign === "" ? "" : cleanCampaignName(rawCampaign);
  if (campaign === null) {
    return NextResponse.json({ error: t("שם קמפיין לא תקין") }, { status: 400 });
  }

  const rawAmount = body?.amount;
  if (rawAmount !== null && rawAmount !== undefined && (typeof rawAmount !== "number" || !Number.isFinite(rawAmount) || rawAmount < 0 || rawAmount > MAX_AMOUNT)) {
    return NextResponse.json({ error: t("סכום לא תקין") }, { status: 400 });
  }
  const amount = typeof rawAmount === "number" ? Math.round(rawAmount * 100) / 100 : null;

  const admin = createServiceRoleClient();
  // A month synced from the connected Meta ad account (lib/metaAds.ts) isn't typed over: the next
  // sync would replace it anyway.
  const { data: existing } = await admin
    .from("ad_spend")
    .select("source")
    .eq("photographer_id", user.id)
    .eq("month", month)
    .eq("campaign", campaign)
    .maybeSingle<{ source: string }>();
  if (existing?.source === "meta") return NextResponse.json({ error: t("הסכום הזה מסונכרן מחשבון המודעות במטא") }, { status: 409 });

  if (!amount) {
    const { error } = await admin.from("ad_spend").delete().eq("photographer_id", user.id).eq("month", month).eq("campaign", campaign);
    if (error) return NextResponse.json({ error: t("שגיאה בשמירה") }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin
    .from("ad_spend")
    .upsert({ photographer_id: user.id, month, campaign, amount, updated_at: new Date().toISOString() }, { onConflict: "photographer_id,month,campaign" });
  if (error) return NextResponse.json({ error: t("שגיאה בשמירה") }, { status: 500 });
  return NextResponse.json({ ok: true });
}
