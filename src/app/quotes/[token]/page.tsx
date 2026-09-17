import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { resolveLeadPackageLabel } from "@/lib/stages";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { CustomPackageRow, EventRow, LeadRow } from "@/lib/types";
import QuoteApprovalFlow from "@/components/QuoteApprovalFlow";

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*, photographers(name, phone, email, whatsapp_signature)")
    .eq("quote_token", token)
    .maybeSingle<LeadRow & { photographers: { name: string; phone: string; email: string; whatsapp_signature: string | null } }>();

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

  // Admin-only for now (see the standing "עדכון אדמין" staged-rollout process): every other
  // photographer's clients keep seeing the original read-only quote page below, unchanged.
  const isAdminLead = lead.photographers.email === ADMIN_EMAIL;

  let convertedClientAccessToken: string | null = null;
  if (isAdminLead && lead.converted_event_id) {
    const { data: convertedEvent } = await supabase
      .from("events")
      .select("client_access_token")
      .eq("id", lead.converted_event_id)
      .maybeSingle<Pick<EventRow, "client_access_token">>();
    convertedClientAccessToken = convertedEvent?.client_access_token ?? null;
  }

  if (isAdminLead) {
    return (
      <QuoteApprovalFlow
        token={token}
        clientName={lead.name}
        clientPhone={lead.phone}
        eventDateInterest={lead.event_date_interest}
        photographerName={lead.photographers.name}
        photographerPhone={lead.photographers.phone}
        whatsappSignature={lead.photographers.whatsapp_signature}
        quotedAmount={lead.quoted_amount}
        quoteNote={lead.quote_note}
        packageLabelText={packageLabelText}
        initialApprovedAt={lead.quote_approved_at}
        initialConvertedEventId={lead.converted_event_id}
        initialClientAccessToken={convertedClientAccessToken}
      />
    );
  }

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <h1 className="text-[22px] font-bold mb-1 font-display">הצעת מחיר לצילום</h1>
      <p className="text-xs mb-5 text-ink-soft">מאת {lead.photographers.name}</p>

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-xs text-ink-soft mb-1">עבור</div>
        <div className="text-sm font-semibold mb-3.5">{lead.name}</div>

        {lead.event_date_interest && (
          <>
            <div className="text-xs text-ink-soft mb-1">תאריך משוער</div>
            <div className="text-sm mb-3.5">{new Date(lead.event_date_interest).toLocaleDateString("he-IL")}</div>
          </>
        )}

        {packageLabelText && (
          <>
            <div className="text-xs text-ink-soft mb-1">חבילה</div>
            <div className="text-sm mb-3.5">{packageLabelText}</div>
          </>
        )}

        <div className="text-xs text-ink-soft mb-1">מחיר</div>
        <div className="text-xl font-bold font-display mb-3.5">₪{lead.quoted_amount.toLocaleString("he-IL")}</div>

        {lead.quote_note && (
          <>
            <div className="text-xs text-ink-soft mb-1">הערות</div>
            <div className="text-sm whitespace-pre-wrap">{lead.quote_note}</div>
          </>
        )}
      </div>

      <div className="rounded-2xl p-4 bg-card border border-line shadow-card text-sm">
        לתיאום ואישור ההזמנה, צרו קשר עם {lead.photographers.name} בטלפון{" "}
        <span dir="ltr">{lead.photographers.phone}</span>.
        {lead.photographers.whatsapp_signature && (
          <div className="mt-2 text-xs text-ink-soft">{lead.photographers.whatsapp_signature}</div>
        )}
      </div>
    </div>
  );
}
