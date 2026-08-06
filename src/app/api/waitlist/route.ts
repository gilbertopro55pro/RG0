import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const {
    clientName,
    clientPhone,
    requestedDate,
    leadId,
    notes,
  }: { clientName: string; clientPhone?: string; requestedDate: string; leadId?: string; notes?: string } =
    await request.json();

  if (!clientName?.trim() || !requestedDate) {
    return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
  }

  const { data: entry, error } = await supabase
    .from("waitlist")
    .insert({
      photographer_id: user.id,
      requested_date: requestedDate,
      client_name: clientName.trim(),
      client_phone: clientPhone || null,
      lead_id: leadId || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error || !entry) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בהוספה לרשימת ההמתנה" }, { status: 500 });
  }

  return NextResponse.json({ entry });
}
