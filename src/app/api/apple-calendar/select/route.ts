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

  const { calendarUrl, displayName }: { calendarUrl?: string; displayName?: string } = await request.json().catch(() => ({}));
  if (!calendarUrl || !displayName) {
    return NextResponse.json({ error: "יש לבחור יומן" }, { status: 400 });
  }

  const { error } = await supabase
    .from("photographers")
    .update({
      apple_calendar_url: calendarUrl,
      apple_calendar_display_name: displayName,
      apple_calendar_connected: true,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
