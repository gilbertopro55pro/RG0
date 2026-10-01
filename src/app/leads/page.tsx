import { redirect } from "next/navigation";
import { quoteExtrasFor } from "@/lib/quoteDefaults";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { CustomPackageRow, EventTypeRow, LeadRow, PackagePriceRow, Photographer, PriceQuoteRow, PriceQuoteTemplateRow } from "@/lib/types";
import LeadsView from "@/components/LeadsView";
import { hasAppAccess } from "@/lib/subscription";

export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: photographer },
    { data: leads },
    { data: customPackages },
    { data: eventTypes },
    { data: prices },
    { data: priceQuotes },
    { data: priceQuoteTemplates },
  ] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase.from("leads").select("*").order("created_at", { ascending: false }).returns<LeadRow[]>(),
    supabase.from("custom_packages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageRow[]>(),
    supabase.from("event_types").select("*").order("sort_order", { ascending: true }).returns<EventTypeRow[]>(),
    supabase.from("package_prices").select("*").returns<PackagePriceRow[]>(),
    // For the quote builder opened from a lead (same data the home page's "הצעות מחיר" uses).
    supabase.from("price_quotes").select("*").order("created_at", { ascending: false }).returns<PriceQuoteRow[]>(),
    supabase.from("price_quote_templates").select("*").order("created_at", { ascending: true }).returns<PriceQuoteTemplateRow[]>(),
  ]);
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  // A lead that finished the quote flow leaves the list (owner, 2026-10-01): the client approved the
  // quote, the questionnaire opened the event, and, when a contract was sent with the quote, it's
  // signed. The row itself stays (the client's /quotes/<token> link and the event depend on it).
  const withContractEvents = (leads ?? [])
    .filter((l) => l.quote_approved_at && l.converted_event_id && l.quote_details?.withContract)
    .map((l) => l.converted_event_id!);
  const { data: signedContracts } = withContractEvents.length
    ? await supabase.from("event_contracts").select("event_id").in("event_id", withContractEvents).eq("status", "signed").returns<{ event_id: string }[]>()
    : { data: [] as { event_id: string }[] };
  const signedEvents = new Set((signedContracts ?? []).map((c) => c.event_id));
  const closedByQuote = (l: LeadRow) =>
    !!l.quote_approved_at && !!l.converted_event_id && (!l.quote_details?.withContract || signedEvents.has(l.converted_event_id));

  // Archived leads (lib/leadRetention.ts) get their own section in the view.
  const active = (leads ?? []).filter((l) => !l.archived_at && !closedByQuote(l));
  const archived = (leads ?? []).filter((l) => !!l.archived_at && !closedByQuote(l));

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <LeadsView
        initialLeads={active}
        archivedLeads={archived}
        customPackages={customPackages ?? []}
        eventTypes={eventTypes ?? []}
        prices={prices ?? []}
        isAdmin={photographer.email === ADMIN_EMAIL}
        quoteBuilder={{
          hourlyRate: photographer.hourly_shoot_rate,
          suppliers: photographer.pricing_suppliers ?? [],
          priceQuotes: priceQuotes ?? [],
          templates: priceQuoteTemplates ?? [],
          customEventTypes: photographer.quote_event_type_suggestions ?? [],
          defaultTaxStatus: photographer.business_tax_status,
          quoteExtras: quoteExtrasFor(photographer.email),
        }}
      />
    </div>
  );
}
