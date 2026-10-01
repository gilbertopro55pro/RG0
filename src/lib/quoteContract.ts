import type { SupabaseClient } from "@supabase/supabase-js";
import { generateContractText } from "@/lib/contracts";
import { packageLabel } from "@/lib/stages";
import type { EventContractRow, EventPaymentRow, EventRow, Photographer } from "@/lib/types";

// A quote sent "with a contract" (LeadQuoteDetails.withContract): once the client's questionnaire
// opens the event, its contract is created right away, the same text the photographer's own
// "create contract" makes (api/events/[id]/contract): the terms of the template they used last,
// else their own terms from Settings. The client signs it as the questionnaire's last step, on
// the quote page; signing (api/contracts/[token]/sign) marks "סגירת האירוע" done and notifies them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createQuoteContract(service: SupabaseClient<any>, eventId: string): Promise<EventContractRow | null> {
  const existing = await latestContract(service, eventId);
  if (existing) return existing;

  const { data: event } = await service
    .from("events")
    .select("*, custom_packages(name)")
    .eq("id", eventId)
    .maybeSingle<EventRow & { custom_packages: { name: string } | null }>();
  if (!event) return null;
  const [{ data: payments }, { data: photographer }, { data: lastWithTemplate }] = await Promise.all([
    service.from("event_payments").select("*").eq("event_id", eventId).maybeSingle<EventPaymentRow>(),
    service.from("photographers").select("*").eq("id", event.photographer_id).maybeSingle<Photographer>(),
    service
      .from("events")
      .select("contract_template_id")
      .eq("photographer_id", event.photographer_id)
      .not("contract_template_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ contract_template_id: string }>(),
  ]);
  if (!photographer) return null;
  const { data: template } = lastWithTemplate?.contract_template_id
    ? await service.from("contract_templates").select("terms").eq("id", lastWithTemplate.contract_template_id).maybeSingle<{ terms: string }>()
    : { data: null };

  const contractText = generateContractText({
    photographerName: photographer.name,
    photographerPhone: photographer.phone,
    signature: photographer.whatsapp_signature,
    customTerms: template?.terms || photographer.custom_contract_terms,
    clientName: event.client_name,
    clientPhone: event.client_phone,
    eventDate: event.event_date,
    eventLocation: event.event_location,
    packageLabelText: packageLabel(event.package, event.custom_packages?.name),
    depositAmount: payments?.deposit_amount ?? 0,
    balanceAmount: payments?.balance_amount ?? 0,
    balanceDueDate: payments?.balance_due_date ?? null,
  });

  const { data: contract, error } = await service
    .from("event_contracts")
    .insert({ event_id: eventId, contract_text: contractText, status: "sent" })
    .select()
    .single<EventContractRow>();
  if (error || !contract) {
    console.error("Quote contract creation failed:", eventId, error);
    return null;
  }
  await service.from("event_notifications").insert({ event_id: eventId, text: "החוזה נשלח ללקוח לחתימה, כשלב האחרון בשאלון של הצעת המחיר" });
  return contract;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function latestContract(service: SupabaseClient<any>, eventId: string): Promise<EventContractRow | null> {
  const { data } = await service
    .from("event_contracts")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<EventContractRow>();
  return data ?? null;
}
