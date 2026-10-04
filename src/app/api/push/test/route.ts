import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendPushToPhotographer } from "@/lib/push";
import { getT } from "@/i18n/server";

// "שליחת התראת בדיקה" in settings: proves the whole path to this photographer's devices.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const { allowed } = await checkRateLimit(`push-test:${user.id}`, { maxRequests: 10, windowSeconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "יותר מדי בדיקות, נסו שוב בעוד שעה" }, { status: 429 });
  // Sent from the settings screen, so in the language that screen is in.
  const t = await getT();
  const sent = await sendPushToPhotographer(user.id, { title: t("גילברטו"), body: t("ההתראות עובדות. ככה תדעו על פנייה חדשה או אישור של לקוח."), url: "/", tag: "test" });
  return NextResponse.json({ sent });
}
