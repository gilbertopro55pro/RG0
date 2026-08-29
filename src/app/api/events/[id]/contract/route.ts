import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateContractText } from "@/lib/contracts";
import { packageLabel } from "@/lib/stages";
import type { EventPaymentRow, EventRow, Photographer } from "@/lib/types";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: contract } = await supabase
    .from("event_contracts")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ contract });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const { contractText }: { contractText: string } = await request.json();
  if (!contractText?.trim()) {
    return NextResponse.json({ error: "טקסט החוזה לא יכול להיות ריק" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("event_contracts")
    .select("id, status")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();

  if (!existing) {
    return NextResponse.json({ error: "לא נמצא חוזה לעריכה" }, { status: 404 });
  }
  if (existing.status === "signed") {
    return NextResponse.json({ error: "החוזה כבר נחתם, לא ניתן לערוך אותו" }, { status: 400 });
  }

  // RLS (owner-only) scopes this update — no separate ownership check needed.
  const { data: contract, error } = await supabase
    .from("event_contracts")
    .update({ contract_text: contractText })
    .eq("id", existing.id)
    .select()
    .single();

  if (error || !contract) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בשמירת החוזה" }, { status: 500 });
  }

  return NextResponse.json({ contract });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  // RLS scopes all three selects below to the owning photographer.
  const [{ data: event }, { data: payments }, { data: photographer }] = await Promise.all([
    supabase
      .from("events")
      .select("*, custom_packages(name)")
      .eq("id", eventId)
      .single<EventRow & { custom_packages: { name: string } | null }>(),
    supabase.from("event_payments").select("*").eq("event_id", eventId).maybeSingle<EventPaymentRow>(),
    supabase.from("photographers").select("*").eq("id", user.id).single<Photographer>(),
  ]);

  if (!event || !photographer) {
    return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("event_contracts")
    .select("id, status")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();

  if (existing?.status === "signed") {
    return NextResponse.json({ error: "החוזה כבר נחתם, לא ניתן ליצור חוזה חדש" }, { status: 400 });
  }

  const contractText = generateContractText({
    photographerName: photographer.name,
    photographerPhone: photographer.phone,
    signature: photographer.whatsapp_signature,
    customTerms: photographer.custom_contract_terms,
    clientName: event.client_name,
    clientPhone: event.client_phone,
    eventDate: event.event_date,
    eventLocation: event.event_location,
    packageLabelText: packageLabel(event.package, event.custom_packages?.name),
    depositAmount: payments?.deposit_amount ?? 0,
    balanceAmount: payments?.balance_amount ?? 0,
    balanceDueDate: payments?.balance_due_date ?? null,
  });

  const { data: contract, error } = existing
    ? await supabase
        .from("event_contracts")
        .update({ contract_text: contractText, status: "sent" })
        .eq("id", existing.id)
        .select()
        .single()
    : await supabase
        .from("event_contracts")
        .insert({ event_id: eventId, contract_text: contractText, status: "sent" })
        .select()
        .single();

  if (error || !contract) {
    return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת החוזה" }, { status: 500 });
  }

  await supabase.from("event_notifications").insert({
    event_id: eventId,
    text: "חוזה נוצר ומוכן לשליחה לחתימה",
  });

  return NextResponse.json({ contract });
}
