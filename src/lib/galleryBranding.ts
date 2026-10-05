import { ADMIN_EMAIL } from "@/lib/admin";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";

// Studio Pro's "full branding" perk (logo + accent color on galleries, see BrandingSettings.tsx).
// The admin account resolves to Studio Pro, as everywhere else in the app.
export function galleryBrandingAllowed(p: { email?: string | null; plan: SubscriptionPlan }): boolean {
  return p.email === ADMIN_EMAIL || SUBSCRIPTION_PLANS[p.plan].tier === "studio_pro";
}
