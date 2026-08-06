import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
    notes?: string;
  } = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "יש להזין שם" }, { status: 400 });
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
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת הליד" }, { status: 500 });
  }

  return NextResponse.json({ lead });
}
