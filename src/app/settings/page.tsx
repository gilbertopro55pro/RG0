import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { ADMIN_EMAIL } from "@/lib/admin";
import { getSignedDownloadUrl } from "@/lib/storage";
import type { ClientMessageTemplateRow, ContractTemplateRow, CustomPackageRow, CustomPackageStageRow, EventTypeRow, PackagePriceRow, Photographer, PriceQuoteRow, PriceQuoteTemplateRow, PrintHouseEmailRow, TeamMember } from "@/lib/types";
import ProfileSettingsView from "@/components/ProfileSettingsView";
import TeamManagementView from "@/components/TeamManagementView";
import PricingSettings from "@/components/PricingSettings";
import PriceQuotesSettings from "@/components/PriceQuotesSettings";
import PricingSuppliersSettings from "@/components/PricingSuppliersSettings";
import BotSettings from "@/components/BotSettings";
import WhatsAppBotAdmin from "@/components/WhatsAppBotAdmin";
import IntakeGuide from "@/components/IntakeGuide";
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
import PushNotificationsSettings from "@/components/PushNotificationsSettings";
import ReminderToggleSettings from "@/components/ReminderToggleSettings";
import MorningDigestSettings from "@/components/MorningDigestSettings";
import { DIGEST_DEFAULT_MINUTES } from "@/lib/morningDigest";
import PrintCheckSettings from "@/components/PrintCheckSettings";
import AlbumApprovalSettings from "@/components/AlbumApprovalSettings";
import SelectionTargetsSettings from "@/components/SelectionTargetsSettings";
import type { SelectionTargets } from "@/lib/selectionTarget";
import { PRINT_CHECK_DAYS_DEFAULT } from "@/lib/printCheck";
import { ALBUM_REMINDER_DAYS_DEFAULT } from "@/lib/albumApproval";
import GuidesSettings from "@/components/GuidesSettings";
import UpdatesSettings from "@/components/UpdatesSettings";
import SettingsTabs from "@/components/SettingsTabs";
import { CURRENT_VERSION } from "@/lib/changelog";
import { canChooseClientLang } from "@/lib/clientLang";
import { SUBSCRIPTION_PLANS, TEAM_MEMBER_LIMIT_BY_TIER, STORAGE_CAP_BYTES_BY_TIER } from "@/lib/stages";
import BackLink from "@/components/BackLink";
import { hasAppAccess, isInTrial, TRIAL_STORAGE_CAP_BYTES } from "@/lib/subscription";
import { intakeMonthlyCap } from "@/lib/intakeAssistant";
import { canBuyIntakePacks, monthKeyIsrael } from "@/lib/intakeCredits";
import { getT } from "@/i18n/server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connected?: string; google_error?: string; tab?: string }>;
}) {
  const { google_connected, google_error, tab } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();

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
    { data: intakeUsage },
  ] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).single<Photographer>(),
    supabase.from("team_members").select("*").order("created_at", { ascending: true }).returns<TeamMember[]>(),
    supabase.from("event_types").select("*").order("sort_order", { ascending: true }).returns<EventTypeRow[]>(),
    supabase.from("package_prices").select("*").returns<PackagePriceRow[]>(),
    supabase.from("custom_packages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageRow[]>(),
    // Archived stages (removed from a package, migration 0169) stay only on existing events.
    supabase.from("custom_package_stages").select("*").is("archived_at", null).order("sort_order", { ascending: true }).returns<CustomPackageStageRow[]>(),
    supabase.from("print_house_emails").select("*").order("created_at", { ascending: true }).returns<PrintHouseEmailRow[]>(),
    supabase.from("price_quotes").select("*").order("created_at", { ascending: false }).returns<PriceQuoteRow[]>(),
    supabase.from("price_quote_templates").select("*").order("created_at", { ascending: true }).returns<PriceQuoteTemplateRow[]>(),
    supabase.from("client_message_templates").select("*").eq("photographer_id", user!.id).returns<ClientMessageTemplateRow[]>(),
    // Summed server-side (see migration 0084) so this stays cheap regardless of photo count —
    // never fetch every gallery_photos row just to add up its file_size_bytes client-side.
    supabase.rpc("photographer_storage_bytes", { p_photographer_id: user!.id }),
    supabase.from("contract_templates").select("*").eq("photographer_id", user!.id).order("created_at", { ascending: true }).returns<ContractTemplateRow[]>(),
    // The server-only monthly counter (intake_monthly_usage, migration 0166), readable by its owner.
    supabase
      .from("intake_monthly_usage")
      .select("used")
      .eq("photographer_id", user!.id)
      .eq("month", monthKeyIsrael())
      .maybeSingle<{ used: number }>(),
  ]);

  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  const intakeUsedThisMonth = intakeUsage?.used ?? 0;

  const t = await getT();

  const logoUrl = photographer.logo_storage_path
    ? await getSignedDownloadUrl("logos", photographer.logo_storage_path, 3600)
    : null;

  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <BackLink href="/" label={t("חזרה לדף הבית")} className="mb-5" />
      <h1 className="text-[22px] font-bold mb-5 font-display">{t("הגדרות")}</h1>
      <SettingsTabs
        currentVersion={CURRENT_VERSION}
        initialTab={tab}
        tabs={[
          {
            id: "profile",
            label: t("פרופיל"),
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
            label: t("תמחור וחבילות צילום"),
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
                    initialSuppliers={photographer.pricing_suppliers}
                  />
                </div>
                <div className="mt-5">
                  <SelectionTargetsSettings
                    photographerId={photographer.id}
                    initialTargets={(photographer as { photo_selection_targets?: SelectionTargets | null }).photo_selection_targets ?? {}}
                    eventTypeNames={(eventTypes ?? []).map((et) => et.name)}
                  />
                </div>
              </>
            ),
          },
          {
            id: "quotes",
            label: t("הצעות מחיר"),
            content: (
              <PriceQuotesSettings
                initialQuotes={priceQuotes ?? []}
                initialTemplates={priceQuoteTemplates ?? []}
                initialSuppliers={photographer.pricing_suppliers}
                initialLogoPath={photographer.logo_storage_path}
                initialLogoUrl={logoUrl}
                initialBusinessId={photographer.business_id}
                taxStatus={photographer.business_tax_status}
              />
            ),
          },
          {
            id: "automation",
            label: t("התראות ואוטומציה"),
            content: (
              <>
              <PushNotificationsSettings />
              <ReminderToggleSettings
                photographerId={photographer.id}
                column="shoot_day_reminder"
                initialEnabled={(photographer as { shoot_day_reminder?: boolean }).shoot_day_reminder ?? true}
              />
              <ReminderToggleSettings
                photographerId={photographer.id}
                column="song_stage_reminder"
                initialEnabled={(photographer as { song_stage_reminder?: boolean }).song_stage_reminder ?? true}
              />
              <MorningDigestSettings
                photographerId={photographer.id}
                initialEnabled={(photographer as { morning_digest?: boolean }).morning_digest ?? true}
                initialMinutes={(photographer as { morning_digest_minutes?: number }).morning_digest_minutes ?? DIGEST_DEFAULT_MINUTES}
              />
              <PrintCheckSettings
                photographerId={photographer.id}
                initialEnabled={(photographer as { print_check?: boolean }).print_check ?? true}
                initialDays={(photographer as { print_check_days?: number }).print_check_days ?? PRINT_CHECK_DAYS_DEFAULT}
              />
              <AlbumApprovalSettings
                photographerId={photographer.id}
                initial={{
                  reminder: (photographer as { album_approval_reminder?: boolean }).album_approval_reminder ?? true,
                  days: (photographer as { album_approval_reminder_days?: number }).album_approval_reminder_days ?? ALBUM_REMINDER_DAYS_DEFAULT,
                  autoPrint: (photographer as { album_auto_print?: boolean }).album_auto_print ?? true,
                }}
              />
              <IntakeGuide />
              <BotSettings
                photographer={photographer}
                cap={intakeMonthlyCap(photographer)}
                usedThisMonth={intakeUsedThisMonth ?? 0}
                extraConversations={(photographer as { intake_extra_conversations?: number }).intake_extra_conversations ?? 0}
                canBuyPacks={canBuyIntakePacks(photographer.email)}
                chatPath={`/chat/${photographer.portfolio_slug ?? photographer.intake_chat_token}`}
              />
              {/* Meta connection details stay folded; only what the photographer edits is always visible. */}
              {user?.email === ADMIN_EMAIL && (
                <details className="mt-5 rounded-2xl bg-card border border-line">
                  <summary className="p-4 text-sm font-semibold cursor-pointer">{t("חיבור וואטסאפ (מטא)")}</summary>
                  <div className="px-4 pb-4">
                    <WhatsAppBotAdmin connectedId={photographer.whatsapp_bot_phone_number_id} />
                  </div>
                </details>
              )}
              </>
            ),
          },
          {
            id: "appearance",
            label: t("מראה"),
            content: <AppearanceSettings canChooseLanguage />,
          },
          {
            id: "account",
            label: t("מנוי וצוות"),
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
                    <div className="text-sm font-semibold mb-1">{t("ניהול מערכת")}</div>
                    <p className="text-xs text-ink-soft mb-3">{t("מוצג רק לחשבון המנהל.")}</p>
                    <Link
                      href="/admin"
                      className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white"
                    >
                      {t("לוח בקרה למנהל")}
                    </Link>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "client_messages",
            label: t("הודעות ללקוח/ה"),
            content: (
              <ClientMessagesSettings
                initialTemplates={messageTemplates ?? []}
                customStages={customStages ?? []}
                clientLangTemplates={canChooseClientLang(photographer.email)}
              />
            ),
          },
          {
            id: "contract_template",
            label: t("תבנית חוזה"),
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
            label: t("פורטפוליו"),
            content: <PortfolioSettings photographer={photographer} />,
          },
          {
            id: "guides",
            label: t("מדריכים"),
            content: <GuidesSettings />,
          },
          {
            id: "updates",
            label: t("עדכונים"),
            content: <UpdatesSettings />,
          },
          {
            id: "terms",
            label: t("תקנון שימוש"),
            content: <TermsOfUseSettings />,
          },
        ]}
      />
      <p className="text-center text-xs font-data text-ink-soft mt-8">{t("גרסה {v}", { v: CURRENT_VERSION })}</p>
      <p className="text-center text-[11px] text-ink-soft mt-1.5">
        © {new Date().getFullYear()} {t("כל הזכויות שמורות לרועי גלברט, צילום אירועים")}
      </p>
    </div>
  );
}
