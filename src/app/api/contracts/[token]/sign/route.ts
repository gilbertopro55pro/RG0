import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { EventContractRow } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { signerName }: { signerName: string } = await request.json();

  if (!signerName?.trim()) {
    return NextResponse.json({ error: "יש להקליד שם מלא" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: contract } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("sign_token", token)
    .maybeSingle<EventContractRow>();

  if (!contract) {
    return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });
  }
  if (contract.status === "signed") {
    return NextResponse.json({ error: "החוזה כבר נחתם" }, { status: 400 });
  }

  const signerIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "לא ידוע";

  const { data: updated, error } = await supabase
    .from("event_contracts")
    .update({
      status: "signed",
      signer_name: signerName.trim(),
      signer_ip: signerIp,
      signed_at: new Date().toISOString(),
    })
    .eq("id", contract.id)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בחתימת החוזה" }, { status: 500 });
  }

  await supabase.from("event_notifications").insert({
    event_id: contract.event_id,
    text: `החוזה נחתם על ידי ${signerName.trim()} ✓`,
  });

  return NextResponse.json({ contract: updated });
}
