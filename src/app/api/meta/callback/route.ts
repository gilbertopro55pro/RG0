import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { campaignsAllowed } from "@/lib/campaignsAccess";
import { exchangeCode, listAdAccounts, syncMetaSpend } from "@/lib/metaAds";

// Back from Facebook's sign-in (lib/metaAds.ts): the code becomes a long-lived token, kept server-side
// only (meta_ad_connections has no RLS policy). With a single ad account it's chosen and synced at
// once; with several, the page asks which one. Always lands on /leads/campaigns with ?meta=<result>.
export async function GET(request: NextRequest) {
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/leads/campaigns?meta=${result}`, request.url));
    res.cookies.delete("meta_oauth_state");
    return res;
  };
  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state || state !== request.cookies.get("meta_oauth_state")?.value) return back("error");
  if (!code) return back(params.get("error") ? "denied" : "error");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !campaignsAllowed(user.email)) return NextResponse.redirect(new URL("/leads", request.url));

  const service = createServiceRoleClient();
  try {
    const { token, expiresAt } = await exchangeCode(code);
    const accounts = await listAdAccounts(token);
    const only = accounts.length === 1 ? accounts[0] : null;
    const { error } = await service.from("meta_ad_connections").upsert(
      {
        photographer_id: user.id,
        access_token: token,
        token_expires_at: expiresAt,
        ad_accounts: accounts,
        ad_account_id: only?.id ?? null,
        ad_account_name: only?.name ?? null,
        currency: only?.currency ?? null,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "photographer_id" }
    );
    if (error) throw new Error(error.message);
    if (accounts.length === 0) return back("no_accounts");
    if (!only) return back("choose");
    await syncMetaSpend(service, user.id).catch(() => {});
    return back("connected");
  } catch (e) {
    console.error("Meta OAuth callback failed:", e instanceof Error ? e.message : e);
    return back("error");
  }
}
