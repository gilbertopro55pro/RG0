import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { EventContractRow, EventRow } from "@/lib/types";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: contract } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("sign_token", token)
    .maybeSingle<EventContractRow>();

  if (!contract) {
    return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_name, event_date")
    .eq("id", contract.event_id)
    .maybeSingle<Pick<EventRow, "client_name" | "event_date">>();

  return NextResponse.json({ contract, event });
}
