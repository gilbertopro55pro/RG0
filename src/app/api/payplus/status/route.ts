import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Photographer } from "@/lib/types";

// Polled by /billing/success — PayPlus redirects the browser here immediately on payment
// success, but subscription_status only flips once the separate server-to-server webhook lands,
// which can trail the redirect by a few seconds. Without this, clicking through too early bounces
// the user right back to /billing.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("subscription_status")
    .eq("id", user.id)
    .maybeSingle<Pick<Photographer, "subscription_status">>();

  const active = photographer?.subscription_status === "active" || photographer?.subscription_status === "trialing";
  return NextResponse.json({ active });
}
