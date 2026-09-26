import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { findLeadsByPhone } from "@/lib/leadDuplicates";
import type { PackageType } from "@/lib/stages";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const body: {
    name: string;
    phone?: string;
    email?: string;
    eventDateInterest?: string;
    packageInterest?: PackageType;
    eventType?: string;
    notes?: string;
    // true = the photographer saw the duplicate warning and chose a new lead anyway.
    allowDuplicate?: boolean;
  } = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "יש להזין שם" }, { status: 400 });
  }

  // Same phone already in the leads: return it (409) so the caller can offer to use that lead
  // instead of opening a second one for the same client.
  if (body.phone?.trim() && !body.allowDuplicate) {
    const matches = await findLeadsByPhone(createServiceRoleClient(), user.id, body.phone);
    if (matches.length > 0) {
      return NextResponse.json({ error: "כבר קיים ליד עם מספר הטלפון הזה", duplicate: matches[0] }, { status: 409 });
    }
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      photographer_id: user.id,
      name: body.name.trim(),
      phone: body.phone || null,
      email: body.email || null,
      event_date_interest: body.eventDateInterest || null,
      package_interest: body.packageInterest || null,
      event_type_name: body.eventType?.trim() || null,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת הליד" }, { status: 500 });
  }

  return NextResponse.json({ lead });
}
