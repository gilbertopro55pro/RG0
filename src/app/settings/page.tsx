import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { CustomPackageRow, CustomPackageStageRow, EventTypeRow, PackagePriceRow, Photographer, TeamMember } from "@/lib/types";
import ProfileSettingsView from "@/components/ProfileSettingsView";
import TeamManagementView from "@/components/TeamManagementView";
import PricingSettings from "@/components/PricingSettings";
import BotSettings from "@/components/BotSettings";
import BillingSettings from "@/components/BillingSettings";
import CustomPackagesSettings from "@/components/CustomPackagesSettings";
import AppearanceSettings from "@/components/AppearanceSettings";
import UpdatesSettings from "@/components/UpdatesSettings";
import SettingsTabs from "@/components/SettingsTabs";
import { CURRENT_VERSION } from "@/lib/changelog";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connected?: string; google_error?: string }>;
}) {
  const { google_connected, google_error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // One parallel batch instead of three sequential round trips — teamMembers and the pricing
  // queries don't depend on the photographer row's value, only on the session already resolved
  // above, so there's no real reason to wait for it first.
  const [
    { data: photographer },
    { data: teamMembers },
    { data: eventTypes },
    { data: prices },
    { data: customPackages },
    { data: customStages },
  ] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).single<Photographer>(),
    supabase.from("team_members").select("*").order("created_at", { ascending: true }).returns<TeamMember[]>(),
    supabase.from("event_types").select("*").order("sort_order", { ascending: true }).returns<EventTypeRow[]>(),
    supabase.from("package_prices").select("*").returns<PackagePriceRow[]>(),
    supabase.from("custom_packages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageRow[]>(),
    supabase.from("custom_package_stages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageStageRow[]>(),
  ]);

  if (!photographer) redirect("/");

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <Link href="/" className="flex items-center gap-1 text-sm mb-5 tracking-wide text-ink-soft">
        ← חזרה לדף הבית
      </Link>
      <h1 className="text-[22px] font-bold mb-5 font-display">הגדרות</h1>
      <SettingsTabs
        tabs={[
          {
            id: "profile",
            label: "פרופיל",
            content: (
              <ProfileSettingsView
                photographer={photographer}
                googleConnectedNotice={google_connected === "1"}
                googleErrorNotice={google_error === "1"}
              />
            ),
          },
          {
            id: "pricing",
            label: "תמחור",
            content: (
              <>
                <PricingSettings initialEventTypes={eventTypes ?? []} initialPrices={prices ?? []} />
                <div className="mt-5">
                  <CustomPackagesSettings
                    initialPackages={customPackages ?? []}
                    initialStages={customStages ?? []}
                    initialEventTypes={eventTypes ?? []}
                    initialPrices={prices ?? []}
                  />
                </div>
              </>
            ),
          },
          {
            id: "automation",
            label: "אוטומציה",
            content: <BotSettings photographer={photographer} />,
          },
          {
            id: "appearance",
            label: "מראה",
            content: <AppearanceSettings />,
          },
          {
            id: "account",
            label: "מנוי וצוות",
            content: (
              <>
                <BillingSettings photographer={photographer} />
                <div className="mt-5">
                  <TeamManagementView initialTeamMembers={teamMembers ?? []} />
                </div>
                {user?.email === ADMIN_EMAIL && (
                  <div className="mt-5 rounded-2xl p-4 bg-card border border-line shadow-card">
                    <div className="text-sm font-semibold tracking-wide mb-1">ניהול מערכת</div>
                    <p className="text-xs text-ink-soft mb-3">מוצג רק לחשבון המנהל.</p>
                    <Link
                      href="/admin"
                      className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white"
                    >
                      לוח בקרה — מנהל
                    </Link>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "updates",
            label: "עדכונים",
            content: <UpdatesSettings />,
          },
        ]}
      />
      <p className="text-center text-xs font-data text-ink-soft mt-8">גרסה {CURRENT_VERSION}</p>
      <p className="text-center text-[11px] text-ink-soft mt-1.5">
        © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט — צילום אירועים
      </p>
    </div>
  );
}
