import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import { TRIAL_DAYS, TRIAL_PLAN } from "@/lib/subscription";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createEmailConfirmToken } from "@/lib/emailConfirmToken";
import { sendEmail } from "@/lib/resend";
import { sendPushToPhotographer } from "@/lib/push";
import { ADMIN_EMAIL } from "@/lib/admin";
import { stripPhoneFormatting } from "@/lib/phone";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { LANG_COOKIE, isLang, type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT, type TFn } from "@/i18n/translate";

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
  const { name, phone, email, password, plan, lang: rawLang } = await request.json().catch(() => ({}));
  // The signup page's language (?lang=en|ru, 2026-10-04): the errors shown on the form and the
  // emails to the new photographer follow it. Hebrew (the default) is exactly as before.
  const lang: Lang = isLang(rawLang) ? rawLang : "he";
  const t = makeT(messagesFor(lang));

  const { allowed } = await checkRateLimit(`signup:${clientIpFrom(request)}`, { maxRequests: 5, windowSeconds: 60 * 60 });
  if (!allowed) {
    return NextResponse.json({ error: t("יותר מדי ניסיונות הרשמה. נסו שוב מאוחר יותר") }, { status: 429 });
  }

  if (!name || !phone || !email || !password || !plan) {
    return NextResponse.json({ error: t("חסרים פרטים") }, { status: 400 });
  }
  const cleanPhone = stripPhoneFormatting(phone);
  // The plan the person expects after the trial; unknown values fall back to the default choice.
  const chosenPlan = typeof plan === "string" && plan in SUBSCRIPTION_PLANS ? plan : "annual";

  const supabase = createServiceRoleClient();

  // One free trial per phone number (normalized in SQL, so "050-…" and "+972 50…" match).
  const { data: phoneTaken } = await supabase.rpc("phone_already_registered", { p: cleanPhone });
  if (phoneTaken) {
    return NextResponse.json(
      { error: t("מספר הטלפון הזה כבר רשום במערכת. נסו להתחבר, או פנו אלינו אם זה חשבון חדש לעסק אחר.") },
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
    const message =
      error.code === "email_exists"
        ? t("כתובת המייל הזו כבר רשומה במערכת. נסו להתחבר.")
        : error.code === "weak_password" || /password/i.test(error.message)
          ? t("הסיסמה חלשה מדי. בחרו סיסמה של 6 תווים לפחות.")
          : error.code === "email_address_invalid" || /email/i.test(error.message)
            ? t("כתובת המייל לא תקינה.")
            : t("ההרשמה נכשלה. נסו שוב.");
    return NextResponse.json({ error: message }, { status: error.status ?? 400 });
  }

  const uid = data.user.id;

  // Start the free trial: full Pro+ features for TRIAL_DAYS, no payment details. The plan picked
  // on the signup form is kept as signup_plan and pre-selected on the plan picker when the trial
  // ends. (The photographers row itself is created by the on_auth_user_created trigger.)
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
  const { error: trialError } = await supabase
    .from("photographers")
    .update({ subscription_status: "trialing", trial_ends_at: trialEndsAt, signup_plan: chosenPlan, plan: TRIAL_PLAN, ui_lang: lang === "he" ? null : lang })
    .eq("id", uid);
  if (trialError) console.error("Trial setup failed:", trialError);
  await notifyAdminOfSignup(supabase, { name, phone: cleanPhone, email, plan: chosenPlan, lang });
  const { ts, sig } = createEmailConfirmToken(uid);
  // lang rides along so the confirm link lands on /login in the same language (the signature
  // covers uid+ts only, so the extra param doesn't affect verification).
  const confirmUrl =
    `${request.nextUrl.origin}/api/auth/confirm-email?uid=${uid}&ts=${ts}&sig=${sig}` + (lang === "he" ? "" : `&lang=${lang}`);
  const mail = signupEmails(t, { name, email, confirmUrl });

  try {
    await sendEmail({ to: email, subject: mail.welcome.subject, text: mail.welcome.text });
  } catch (e) {
    console.error("Welcome email failed:", e);
  }

  try {
    await sendEmail({ to: email, subject: mail.login.subject, text: mail.login.text });
  } catch (e) {
    console.error("Login-details email failed:", e);
    // Only this one carries the confirmation link — if it genuinely couldn't be sent, say so
    // instead of leaving the person stuck on "check your email" for a mail that never arrived.
    return withLangCookie(
      NextResponse.json({ error: t("החשבון נוצר אך שליחת מייל האימות נכשלה. נסו שוב או צרו קשר") }, { status: 502 }),
      lang
    );
  }

  return withLangCookie(NextResponse.json({ ok: true }), lang);
}

// The owner hears about every new signup (owner, 2026-10-06, the day the system went public): an
// email to the admin address (sendEmail routes it to the owner's real inbox) and a push to the
// admin account's phones. Best-effort: a failed alert never fails the signup itself.
async function notifyAdminOfSignup(
  supabase: ReturnType<typeof createServiceRoleClient>,
  p: { name: string; phone: string; email: string; plan: string; lang: Lang }
): Promise<void> {
  const planLabel = SUBSCRIPTION_PLANS[p.plan as keyof typeof SUBSCRIPTION_PLANS]?.label ?? p.plan;
  const langLabel = p.lang === "en" ? "אנגלית" : p.lang === "ru" ? "רוסית" : "עברית";
  const when = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
  const tasks: Promise<unknown>[] = [
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `נרשם משתמש חדש: ${p.name}`,
      text:
        `נרשם משתמש חדש לגילברטו.\n\n` +
        `שם: ${p.name}\nטלפון: ${p.phone}\nמייל: ${p.email}\nמסלול שנבחר: ${planLabel}\nשפה: ${langLabel}\nמועד: ${when}\n\n` +
        `תקופת הניסיון (14 יום) התחילה.`,
    }),
  ];
  const { data: admin } = await supabase.from("photographers").select("id").eq("email", ADMIN_EMAIL).maybeSingle<{ id: string }>();
  if (admin) tasks.push(sendPushToPhotographer(admin.id, { title: "נרשם משתמש חדש", body: `${p.name} · ${p.phone}`, url: "/admin", tag: "new-signup" }));
  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === "rejected") console.error("Admin signup alert failed:", r.reason);
}

// The account exists: a signup in English/Russian opens the app in that language on this device
// (same cookie as Settings › תצוגה). Hebrew leaves any existing cookie alone.
function withLangCookie(res: NextResponse, lang: Lang): NextResponse {
  if (lang !== "he") res.cookies.set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

// The two emails to the new photographer (plain text). The Hebrew text is the key (and, in Hebrew,
// exactly the original wording); English/Russian come from src/i18n/dict/auth.ts.
const WELCOME_TEXT =
  "שלום {name},\n\n" +
  "תודה שנרשמת למערכת גילברטו לניהול צילום אירועים! ניהול אירועים, גלריות ללקוחות, חוזים דיגיטליים " +
  "ותשלומים, הכל במקום אחד.\n\n" +
  "{days} הימים הראשונים בחינם, עם כל האפשרויות של מסלול פרו+, בלי כרטיס אשראי. " +
  "לקראת סוף תקופת הניסיון נזכיר לכם לבחור מסלול.\n\n" +
  "בהצלחה,\nצוות גילברטו";
const LOGIN_TEXT =
  "שלום {name},\n\n" +
  "החשבון שלך במערכת מוכן לשימוש. פרטי ההתחברות:\n\n" +
  "שם משתמש (אימייל): {email}\n" +
  "סיסמה: הסיסמה שבחרת בעת ההרשמה\n\n" +
  "כניסה למערכת: {url}\n\n" +
  "הקישור הזה גם מאשר את כתובת המייל שלך. לחיצה עליו תפנה אתכם ישר להתחברות.\n\n" +
  "מסיבות אבטחה איננו שולחים סיסמאות בטקסט גלוי במייל. אם שכחת אותה אפשר לאפס אותה דרך " +
  "\"שכחתי סיסמה\" במסך ההתחברות.";

function signupEmails(t: TFn, v: { name: string; email: string; confirmUrl: string }) {
  return {
    welcome: {
      subject: t("תודה שהצטרפת למערכת גילברטו"),
      text: t(WELCOME_TEXT, { name: v.name, days: TRIAL_DAYS }),
    },
    login: {
      subject: t("פרטי ההתחברות למערכת גילברטו - ניהול צילום אירועים"),
      text: t(LOGIN_TEXT, { name: v.name, email: v.email, url: v.confirmUrl }),
    },
  };
}
