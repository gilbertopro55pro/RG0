import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { resolveLeadPackageLabel } from "@/lib/stages";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { CustomPackageRow, EventContractRow, EventRow, LeadRow } from "@/lib/types";
import QuoteApprovalFlow from "@/components/QuoteApprovalFlow";
import { getSignedDownloadUrl } from "@/lib/storage";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { slotFor, type LeadQuoteDetails } from "@/lib/leadQuote";
import { latestContract } from "@/lib/quoteContract";

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*, photographers(name, phone, email, whatsapp_signature, business_id, business_tax_status, logo_storage_path)")
    .eq("quote_token", token)
    .maybeSingle<
      LeadRow & {
        quote_details: LeadQuoteDetails | null;
        photographers: {
          name: string;
          phone: string;
          email: string;
          whatsapp_signature: string | null;
          business_id: string | null;
          business_tax_status: "exempt" | "licensed" | null;
          logo_storage_path: string | null;
        };
      }
    >();

  if (!lead || !lead.quoted_amount) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
        <p className="text-sm text-ink-soft">הצעת המחיר לא נמצאה.</p>
      </div>
    );
  }

  const { data: customPackages } = await supabase
    .from("custom_packages")
    .select("*")
    .eq("photographer_id", lead.photographer_id)
    .returns<CustomPackageRow[]>();
  const packageLabelText = resolveLeadPackageLabel(lead.package_interest, customPackages ?? []);

  // The owner's own hours rules (default hours, family photos, the extra-hours notice) are for their
  // clients only; every photographer's client gets the page, the approval and the questionnaire.
  const isAdminLead = lead.photographers.email === ADMIN_EMAIL;

  let convertedClientAccessToken: string | null = null;
  if (lead.converted_event_id) {
    const { data: convertedEvent } = await supabase
      .from("events")
      .select("client_access_token")
      .eq("id", lead.converted_event_id)
      .maybeSingle<Pick<EventRow, "client_access_token">>();
    convertedClientAccessToken = convertedEvent?.client_access_token ?? null;
  }
  // Sent with a contract: a returning client lands back on the signing step until it's signed.
  const contract: EventContractRow | null =
    lead.converted_event_id && lead.quote_details?.withContract ? await latestContract(supabase, lead.converted_event_id) : null;

  const ph = lead.photographers;
  const logoUrl = ph.logo_storage_path ? await getSignedDownloadUrl("logos", ph.logo_storage_path, 60 * 60 * 24) : null;
  const conv = (lead.details ?? null) as { eventSlot?: string; location?: string } | null;
  return (
    <QuoteApprovalFlow
      token={token}
      clientName={lead.name}
      clientPhone={lead.phone}
      eventDateInterest={lead.event_date_interest}
      eventTypeName={lead.event_type_name}
      photographer={{
        name: ph.name,
        phone: ph.phone,
        email: notificationEmailFor(ph.email),
        businessId: ph.business_id,
        taxStatus: ph.business_tax_status,
        logoUrl,
        whatsappSignature: ph.whatsapp_signature,
      }}
      quotedAmount={lead.quoted_amount}
      quoteNote={lead.quote_note}
      details={lead.quote_details}
      slot={slotFor(conv?.eventSlot, lead.quote_details?.startTime)}
      knownLocation={conv?.location ?? null}
      initialApprovedAt={lead.quote_approved_at}
      initialConvertedEventId={lead.converted_event_id}
      initialClientAccessToken={convertedClientAccessToken}
      initialContract={contract}
      businessRules={isAdminLead}
      packageLabel={packageLabelText || null}
    />
  );
}
