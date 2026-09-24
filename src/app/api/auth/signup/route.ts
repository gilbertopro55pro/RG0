import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import { TRIAL_DAYS, TRIAL_PLAN } from "@/lib/subscription";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createEmailConfirmToken } from "@/lib/emailConfirmToken";
import { sendEmail } from "@/lib/resend";
import { stripPhoneFormatting } from "@/lib/phone";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";

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
  // Fully public and unauthenticated by nature (that's the point of a signup form), and the one
  // custom-built auth endpoint that bypasses Supabase's own signUp() — and with it, Supabase
  // Auth's own baseline rate limiting — via admin.createUser instead (see this file's own
  // top comment). Without a check here, this was the one open door for creating accounts (and
  // burning through Resend's send quota, two emails per call) with no limit at all.
  const { allowed } = await checkRateLimit(`signup:${clientIpFrom(request)}`, { maxRequests: 5, windowSeconds: 60 * 60 });
  if (!allowed) {
    return NextResponse.json({ error: "יותר מדי ניסיונות הרשמה. נסו שוב מאוחר יותר" }, { status: 429 });
  }

  const { name, phone, email, password, plan } = await request.json().catch(() => ({}));
  if (!name || !phone || !email || !password || !plan) {
    return NextResponse.json({ error: "חסרים פרטים" }, { status: 400 });
  }
  const cleanPhone = stripPhoneFormatting(phone);
  // The plan the person expects after the trial; unknown values fall back to the default choice.
  const chosenPlan = typeof plan === "string" && plan in SUBSCRIPTION_PLANS ? plan : "annual";

  const supabase = createServiceRoleClient();

  // One free trial per phone number (normalized in SQL, so "050-…" and "+972 50…" match).
  const { data: phoneTaken } = await supabase.rpc("phone_already_registered", { p: cleanPhone });
  if (phoneTaken) {
    return NextResponse.json(
      { error: "מספר הטלפון הזה כבר רשום במערכת. נסו להתחבר, או פנו אלינו אם זה חשבון חדש לעסק אחר." },
      { status: 409 }
    );
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { name, phone: cleanPhone, plan: chosenPlan },
  });

  if (error) {
    const message = error.code === "email_exists" ? "כתובת המייל הזו כבר רשומה במערכת. נסו להתחבר." : error.message;
    return NextResponse.json({ error: message }, { status: error.status ?? 400 });
  }

  const uid = data.user.id;

  // Start the free trial: full Pro+ features for TRIAL_DAYS, no payment details. The plan picked
  // on the signup form is kept as signup_plan and pre-selected on the plan picker when the trial
  // ends. (The photographers row itself is created by the on_auth_user_created trigger.)
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
  const { error: trialError } = await supabase
    .from("photographers")
    .update({ subscription_status: "trialing", trial_ends_at: trialEndsAt, signup_plan: chosenPlan, plan: TRIAL_PLAN })
    .eq("id", uid);
  if (trialError) console.error("Trial setup failed:", trialError);
  const { ts, sig } = createEmailConfirmToken(uid);
  const confirmUrl = `${request.nextUrl.origin}/api/auth/confirm-email?uid=${uid}&ts=${ts}&sig=${sig}`;

  try {
    await sendEmail({
      to: email,
      subject: "תודה שהצטרפת למערכת גילברטו",
      text:
        `שלום ${name},\n\n` +
        `תודה שנרשמת למערכת גילברטו לניהול צילום אירועים! ניהול אירועים, גלריות ללקוחות, חוזים דיגיטליים ` +
        `ותשלומים, הכל במקום אחד.\n\n` +
        `${TRIAL_DAYS} הימים הראשונים בחינם, עם כל האפשרויות של מסלול פרו+, בלי כרטיס אשראי. ` +
        `לקראת סוף תקופת הניסיון נזכיר לכם לבחור מסלול.\n\n` +
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
        `הקישור הזה גם מאשר את כתובת המייל שלך. לחיצה עליו תפנה אתכם ישר להתחברות.\n\n` +
        `מסיבות אבטחה איננו שולחים סיסמאות בטקסט גלוי במייל. אם שכחת אותה אפשר לאפס אותה דרך ` +
        `"שכחתי סיסמה" במסך ההתחברות.`,
    });
  } catch (e) {
    console.error("Login-details email failed:", e);
    // Only this one carries the confirmation link — if it genuinely couldn't be sent, say so
    // instead of leaving the person stuck on "check your email" for a mail that never arrived.
    return NextResponse.json({ error: "החשבון נוצר אך שליחת מייל האימות נכשלה. נסו שוב או צרו קשר" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
