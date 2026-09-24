import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import { hasAppAccess } from "@/lib/subscription";
import type { Photographer } from "@/lib/types";

// The design tools (album designer, magnet frames) are a פרו / פרו+ feature: every tier except the
// entry one ("basic", פרו סטארט), trials included (they run on studio_pro_monthly). Admin always.
export function designToolsAllowed(p: Pick<Photographer, "email" | "plan">): boolean {
  return p.email === ADMIN_EMAIL || SUBSCRIPTION_PLANS[p.plan].tier !== "basic";
}

// Server-side gate for the magnet-frames API routes: a signed-in photographer on a paid-up
// (or in-trial) פרו / פרו+ account. null → the route answers 403.
export async function requireDesignToolsUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: photographer } = await supabase
    .from("photographers")
    .select("email, plan, subscription_status, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle<Pick<Photographer, "email" | "plan" | "subscription_status" | "trial_ends_at">>();
  if (!photographer || !designToolsAllowed(photographer)) return null;
  if (photographer.email !== ADMIN_EMAIL && !hasAppAccess(photographer)) return null;
  return { supabase, userId: user.id };
}
