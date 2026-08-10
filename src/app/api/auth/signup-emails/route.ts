import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/resend";

// Fired once, right after a successful signUp() call — two separate emails per the spec (a
// thank-you, plus a login-details email with an exact required subject line). The password
// itself is deliberately left out of the login-details email: we only have it in the client's
// signup form for the instant of the request, and emailing a plaintext password is a real
// security anti-pattern regardless of transport — the email points back at "שכחתי סיסמה" instead.
export async function POST(request: NextRequest) {
  const { name, email } = await request.json().catch(() => ({}));
  if (!name || !email) {
    return NextResponse.json({ error: "חסרים פרטים" }, { status: 400 });
  }

  const loginUrl = `${request.nextUrl.origin}/login`;

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
        `כניסה למערכת: ${loginUrl}\n\n` +
        `מסיבות אבטחה איננו שולחים סיסמאות בטקסט גלוי במייל — אם שכחת אותה אפשר לאפס אותה דרך ` +
        `"שכחתי סיסמה" במסך ההתחברות.`,
    });
  } catch (e) {
    console.error("Login-details email failed:", e);
  }

  return NextResponse.json({ ok: true });
}
