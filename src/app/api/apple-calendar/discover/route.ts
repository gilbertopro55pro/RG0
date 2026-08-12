import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { discoverAppleCalendars } from "@/lib/appleCalendar";

// Step 1 of connecting Apple Calendar: verify the email + app-specific password work, list the
// account's real calendars so the photographer can pick one, and stash the credentials (not yet
// marked connected — that happens once a calendar is actually selected in step 2).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { email, appPassword }: { email?: string; appPassword?: string } = await request.json().catch(() => ({}));
  if (!email?.trim() || !appPassword?.trim()) {
    return NextResponse.json({ error: "יש להזין כתובת מייל וסיסמה ייעודית לאפליקציה" }, { status: 400 });
  }

  try {
    const calendars = await discoverAppleCalendars(email.trim(), appPassword.trim());
    await supabase
      .from("photographers")
      .update({ apple_calendar_email: email.trim(), apple_calendar_app_password: appPassword.trim() })
      .eq("id", user.id);
    return NextResponse.json({ calendars });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "החיבור ל-iCloud נכשל" }, { status: 400 });
  }
}
