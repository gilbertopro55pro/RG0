import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { getSignedDownloadUrl } from "@/lib/storage";
import type { ClientMessageTemplateRow, ContractTemplateRow, CustomPackageRow, CustomPackageStageRow, EventTypeRow, PackagePriceRow, Photographer, PriceQuoteRow, PriceQuoteTemplateRow, PrintHouseEmailRow, TeamMember } from "@/lib/types";
import ProfileSettingsView from "@/components/ProfileSettingsView";
import TeamManagementView from "@/components/TeamManagementView";
import PricingSettings from "@/components/PricingSettings";
import PriceQuotesSettings from "@/components/PriceQuotesSettings";
import PricingSuppliersSettings from "@/components/PricingSuppliersSettings";
import BotSettings from "@/components/BotSettings";
import BillingSettings from "@/components/BillingSettings";
import StorageUsageSettings from "@/components/StorageUsageSettings";
import BrandingSettings from "@/components/BrandingSettings";
import CustomPackagesSettings from "@/components/CustomPackagesSettings";
import PrintHouseEmailsSettings from "@/components/PrintHouseEmailsSettings";
import ClientMessagesSettings from "@/components/ClientMessagesSettings";
import TermsOfUseSettings from "@/components/TermsOfUseSettings";
import ContractTemplateSettings from "@/components/ContractTemplateSettings";
import ContractTemplateLibrarySettings from "@/components/ContractTemplateLibrarySettings";
import PortfolioSettings from "@/components/PortfolioSettings";
import AppearanceSettings from "@/components/AppearanceSettings";
import GuidesSettings from "@/components/GuidesSettings";
import UpdatesSettings from "@/components/UpdatesSettings";
import SettingsTabs from "@/components/SettingsTabs";
import { CURRENT_VERSION } from "@/lib/changelog";
import { SUBSCRIPTION_PLANS, TEAM_MEMBER_LIMIT_BY_TIER, STORAGE_CAP_BYTES_BY_TIER } from "@/lib/stages";
import BackLink from "@/components/BackLink";
import { hasAppAccess, isInTrial, TRIAL_STORAGE_CAP_BYTES } from "@/lib/subscription";

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
    { data: printHouseEmails },
    { data: priceQuotes },
    { data: priceQuoteTemplates },
    { data: messageTemplates },
    { data: storageBytes },
    { data: contractTemplates },
  ] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).single<Photographer>(),
    supabase.from("team_members").select("*").order("created_at", { ascending: true }).returns<TeamMember[]>(),
    supabase.from("event_types").select("*").order("sort_order", { ascending: true }).returns<EventTypeRow[]>(),
    supabase.from("package_prices").select("*").returns<PackagePriceRow[]>(),
    supabase.from("custom_packages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageRow[]>(),
    supabase.from("custom_package_stages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageStageRow[]>(),
    supabase.from("print_house_emails").select("*").order("created_at", { ascending: true }).returns<PrintHouseEmailRow[]>(),
    supabase.from("price_quotes").select("*").order("created_at", { ascending: false }).returns<PriceQuoteRow[]>(),
    supabase.from("price_quote_templates").select("*").order("created_at", { ascending: true }).returns<PriceQuoteTemplateRow[]>(),
    supabase.from("client_message_templates").select("*").eq("photographer_id", user!.id).returns<ClientMessageTemplateRow[]>(),
    // Summed server-side (see migration 0084) so this stays cheap regardless of photo count —
    // never fetch every gallery_photos row just to add up its file_size_bytes client-side.
    supabase.rpc("photographer_storage_bytes", { p_photographer_id: user!.id }),
    supabase.from("contract_templates").select("*").eq("photographer_id", user!.id).order("created_at", { ascending: true }).returns<ContractTemplateRow[]>(),
  ]);

  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  const logoUrl = photographer.logo_storage_path
    ? await getSignedDownloadUrl("logos", photographer.logo_storage_path, 3600)
    : null;

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <BackLink href="/" label="חזרה לדף הבית" className="mb-5" />
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
            label: "תמחור וחבילות צילום",
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
                <div className="mt-5">
                  <PricingSuppliersSettings
                    initialHourlyRate={photographer.hourly_shoot_rate}
                    initialSuppliers={photographer.pricing_suppliers}
                  />
                </div>
              </>
            ),
          },
          {
            id: "quotes",
            label: "הצעות מחיר",
            content: (
              <PriceQuotesSettings
                initialQuotes={priceQuotes ?? []}
                initialTemplates={priceQuoteTemplates ?? []}
                initialSuppliers={photographer.pricing_suppliers}
                initialLogoPath={photographer.logo_storage_path}
                initialLogoUrl={logoUrl}
                initialBusinessId={photographer.business_id}
              />
            ),
          },
          {
            id: "automation",
            label: "אוטומציה",
            content: <BotSettings />,
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
                  <StorageUsageSettings
                    usedBytes={Number(storageBytes ?? 0)}
                    capBytes={isInTrial(photographer) ? TRIAL_STORAGE_CAP_BYTES : STORAGE_CAP_BYTES_BY_TIER[SUBSCRIPTION_PLANS[photographer.plan].tier]}
                  />
                </div>
                <div className="mt-5">
                  <BrandingSettings photographer={photographer} hasLogo={!!photographer.logo_storage_path} />
                </div>
                <div className="mt-5">
                  <TeamManagementView
                    initialTeamMembers={teamMembers ?? []}
                    limit={TEAM_MEMBER_LIMIT_BY_TIER[SUBSCRIPTION_PLANS[photographer.plan].tier]}
                  />
                </div>
                <div className="mt-5">
                  <PrintHouseEmailsSettings initialEmails={printHouseEmails ?? []} />
                </div>
                {user?.email === ADMIN_EMAIL && (
                  <div className="mt-5 rounded-2xl p-4 bg-card border border-line shadow-card">
                    <div className="text-sm font-semibold mb-1">ניהול מערכת</div>
                    <p className="text-xs text-ink-soft mb-3">מוצג רק לחשבון המנהל.</p>
                    <Link
                      href="/admin"
                      className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white"
                    >
                      לוח בקרה למנהל
                    </Link>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "client_messages",
            label: "הודעות ללקוח/ה",
            content: (
              <ClientMessagesSettings initialTemplates={messageTemplates ?? []} customStages={customStages ?? []} />
            ),
          },
          {
            id: "contract_template",
            label: "תבנית חוזה",
            content: (
              <>
                <ContractTemplateSettings photographer={photographer} />
                <div className="mt-5">
                  <ContractTemplateLibrarySettings initialTemplates={contractTemplates ?? []} />
                </div>
              </>
            ),
          },
          {
            id: "portfolio",
            label: "פורטפוליו",
            content: <PortfolioSettings photographer={photographer} />,
          },
          {
            id: "guides",
            label: "מדריכים",
            content: <GuidesSettings />,
          },
          {
            id: "updates",
            label: "עדכונים",
            content: <UpdatesSettings />,
          },
          {
            id: "terms",
            label: "תקנון שימוש",
            content: <TermsOfUseSettings />,
          },
        ]}
      />
      <p className="text-center text-xs font-data text-ink-soft mt-8">גרסה {CURRENT_VERSION}</p>
      <p className="text-center text-[11px] text-ink-soft mt-1.5">
        © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט, צילום אירועים
      </p>
    </div>
  );
}
