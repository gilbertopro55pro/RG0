import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { LANG_COOKIE, isLang } from "@/i18n/config";

// Sets the UI language cookie (src/i18n). Admin account only while phase 1 is checked.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  if (user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "עדיין לא זמין בחשבון הזה" }, { status: 403 });

  const { lang }: { lang?: string } = await request.json().catch(() => ({}));
  if (!isLang(lang)) return NextResponse.json({ error: "שפה לא תקינה" }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
