import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadObjectBuffer } from "@/lib/storage";
import { buildContractPdf } from "@/lib/contractPdf";
import type { EventContractRow, EventRow, Photographer } from "@/lib/types";

export const runtime = "nodejs";

// The event's contract as a PDF (ContractSection's download button), for the photographer to save or
// send to the client: signed, with the client's signature; before that, with lines to sign on. RLS
// keeps the event, its contract and the photographer row to their owner.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const [{ data: event }, { data: contract }] = await Promise.all([
    supabase.from("events").select("id, photographer_id, client_name, event_date").eq("id", eventId).maybeSingle<Pick<EventRow, "id" | "photographer_id" | "client_name" | "event_date">>(),
    supabase.from("event_contracts").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle<EventContractRow>(),
  ]);
  if (!event || !contract) return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });

  // The studio is the event's owner (a team member downloading it sees the owner's name and logo).
  const { data: owner } = await supabase
    .from("photographers")
    .select("name, logo_storage_path")
    .eq("id", event.photographer_id)
    .maybeSingle<Pick<Photographer, "name" | "logo_storage_path">>();
  const logoBuffer = owner?.logo_storage_path ? await downloadObjectBuffer("logos", owner.logo_storage_path).catch(() => null) : null;

  const bytes = await buildContractPdf({
    studio: owner?.name ?? "",
    logoBuffer,
    clientName: event.client_name,
    eventDate: event.event_date,
    contract,
  });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="contract.pdf"', "Cache-Control": "private, no-store" },
  });
}
