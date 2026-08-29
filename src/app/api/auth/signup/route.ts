import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createEmailConfirmToken } from "@/lib/emailConfirmToken";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";

// Signup runs server-side (via the admin API) rather than the client-side supabase.auth.signUp()
// this replaced, for two reasons: admin.createUser lets us create the user as unconfirmed
// (email_confirm: false) WITHOUT Supabase sending its own confirmation email at all — we send our
// own instead (see below), through the same Resend path already proven reliable for the other
// signup emails, rather than depending on Supabase's mailer a second time. It also gives a real,
// specific "email already registered" error instead of signUp()'s deliberately vague response
// (Supabase blurs that case to prevent email-enumeration on a public unauthenticated endpoint —
// safe to surface plainly here since it's what a normal signup form needs to tell the person).
export async function POST(request: NextRequest) {
  const { name, phone, email, password, plan } = await request.json().catch(() => ({}));
  if (!name || !phone || !email || !password || !plan) {
    return NextResponse.json({ error: "חסרים פרטים" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { name, phone, plan },
  });

  if (error) {
    const message = error.code === "email_exists" ? "כתובת המייל הזו כבר רשומה במערכת — נסו להתחבר." : error.message;
    return NextResponse.json({ error: message }, { status: error.status ?? 400 });
  }

  const uid = data.user.id;
  const { ts, sig } = createEmailConfirmToken(uid);
  const confirmUrl = `${request.nextUrl.origin}/api/auth/confirm-email?uid=${uid}&ts=${ts}&sig=${sig}`;

  try {
    await sendEmail({
      to: email,
      subject: "תודה שהצטרפת למערכת גילברטו",
      text:
        `שלום ${name},\n\n` +
        `תודה שנרשמת למערכת גילברטו לניהול צילום אירועים! ניהול אירועים, גלריות ללקוחות, חוזים דיגיטליים ` +
        `ועדכונים אוטומטיים — הכל במקום אחד.\n\n` +
        `בהצלחה,\nצוות גילברטו`,
    });
  } catch (e) {
    console.error("Welcome email failed:", e);
  }

  try {
    await sendEmail({
      to: email,
      subject: "פרטי ההתחברות למערכת גילברטו - ניהול צילום אירועים",
      text:
        `שלום ${name},\n\n` +
        `החשבון שלך במערכת מוכן לשימוש. פרטי ההתחברות:\n\n` +
        `שם משתמש (אימייל): ${email}\n` +
        `סיסמה: הסיסמה שבחרת בעת ההרשמה\n\n` +
        `כניסה למערכת: ${confirmUrl}\n\n` +
        `הקישור הזה גם מאשר את כתובת המייל שלך — לחיצה עליו תפנה אתכם ישר להתחברות.\n\n` +
        `מסיבות אבטחה איננו שולחים סיסמאות בטקסט גלוי במייל — אם שכחת אותה אפשר לאפס אותה דרך ` +
        `"שכחתי סיסמה" במסך ההתחברות.`,
    });
  } catch (e) {
    console.error("Login-details email failed:", e);
    // Only this one carries the confirmation link — if it genuinely couldn't be sent, say so
    // instead of leaving the person stuck on "check your email" for a mail that never arrived.
    return NextResponse.json({ error: "החשבון נוצר אך שליחת מייל האימות נכשלה — נסו שוב או צרו קשר" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
