import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { EventContractRow, EventRow } from "@/lib/types";
import ContractSignForm from "@/components/ContractSignForm";

export default async function ContractSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: contract } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("sign_token", token)
    .maybeSingle<EventContractRow>();

  if (!contract) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
        <p className="text-sm text-ink-soft">החוזה לא נמצא, ייתכן שהקישור שגוי.</p>
      </div>
    );
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_name, event_date")
    .eq("id", contract.event_id)
    .maybeSingle<Pick<EventRow, "client_name" | "event_date">>();

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <h1 className="text-[22px] font-bold mb-1 font-display">חוזה הזמנת צילום</h1>
      {event && (
        <p className="text-xs mb-5 text-ink-soft">
          {event.client_name} · {new Date(event.event_date).toLocaleDateString("he-IL")}
        </p>
      )}
      <ContractSignForm contract={contract} />
    </div>
  );
}
