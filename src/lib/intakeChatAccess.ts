import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { hasAppAccess } from "@/lib/subscription";
import { ADMIN_EMAIL } from "@/lib/admin";
import { intakeMonthlyCap, type IntakePhotographer } from "@/lib/intakeAssistant";
import type { Photographer } from "@/lib/types";
import { INTAKE_ALERT_RATIO, monthKeyIsrael } from "@/lib/intakeCredits";
import { sendPushToPhotographer } from "@/lib/push";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type ChatPhotographer = IntakePhotographer &
  Pick<Photographer, "subscription_status" | "trial_ends_at" | "portfolio_slug" | "logo_storage_path" | "meta_pixel_id" | "intake_chat_title"> & {
    // Bought conversations left (migration 0147).
    intake_extra_conversations: number;
  };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The public chat link is /chat/<key>: the photographer's portfolio slug when they have one
// (readable to share), otherwise their private intake_chat_token.
export async function resolveChatPhotographer(supabase: ServiceClient, key: string): Promise<ChatPhotographer | null> {
  const fields =
    "id, name, email, plan, subscription_status, trial_ends_at, portfolio_slug, logo_storage_path, intake_bot_enabled, intake_bot_faq, intake_bot_reply_hours, intake_bot_extra_question, intake_allow_split_day, intake_shabbat_closed, google_calendar_import_color_id, google_calendar_color_id, meta_pixel_id, intake_chat_title, intake_extra_conversations";
  const bySlug = await supabase.from("photographers").select(fields).eq("portfolio_slug", key).maybeSingle<ChatPhotographer>();
  if (bySlug.data) return bySlug.data;
  if (!UUID_RE.test(key)) return null;
  const byToken = await supabase.from("photographers").select(fields).eq("intake_chat_token", key).maybeSingle<ChatPhotographer>();
  return byToken.data ?? null;
}

// Why the assistant can't take this conversation — null means it can. When it can't, the page
// falls back to the plain inquiry form (no model call), so a client is never turned away.
export async function assistantUnavailableReason(supabase: ServiceClient, p: ChatPhotographer): Promise<"disabled" | "plan" | "cap" | null> {
  if (!p.intake_bot_enabled) return "disabled";
  if (p.email !== ADMIN_EMAIL && !hasAppAccess(p)) return "plan";
  const cap = intakeMonthlyCap(p);
  if (cap <= 0) return "plan";
  const used = await intakeUsedThisMonth(supabase, p.id);
  return used >= cap && (p.intake_extra_conversations ?? 0) <= 0 ? "cap" : null;
}

// This month's web conversations that count toward the plan's cap (a client wrote at least once;
// conversations paid with a bought credit don't count).
export async function intakeUsedThisMonth(supabase: ServiceClient, photographerId: string): Promise<number> {
  const { count } = await supabase
    .from("bot_conversations")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", photographerId)
    .eq("channel", "web")
    .eq("extra_credit", false)
    .gt("client_turns", 0)
    .gte("created_at", monthStartIsrael().toISOString());
  return count ?? 0;
}

// A new conversation takes a slot: the plan's monthly cap first, then a bought conversation.
// Null = no slot (the caller shows the form). When this conversation brings the month to 90% of
// the cap, the photographer's phone gets one notification for the month (owner, 2026-10-01).
export async function claimConversationSlot(supabase: ServiceClient, p: ChatPhotographer): Promise<{ extraCredit: boolean } | null> {
  const cap = intakeMonthlyCap(p);
  const used = await intakeUsedThisMonth(supabase, p.id);
  if (used < cap) {
    if (used + 1 >= cap) await alertCapFull(supabase, p, cap);
    else if (used + 1 >= Math.ceil(cap * INTAKE_ALERT_RATIO)) await alertNearCap(supabase, p, used + 1, cap);
    return { extraCredit: false };
  }
  const { data: took } = await supabase.rpc("consume_intake_extra", { p_photographer: p.id });
  if (took !== true) return null;
  // This one took the last bought conversation: from the next one, clients get the form.
  if ((p.intake_extra_conversations ?? 0) <= 1) await alertExtrasGone(p, cap);
  return { extraCredit: true };
}

// The conversation that uses up the month's cap (owner, 2026-10-01): phone + email, once a month.
async function alertCapFull(supabase: ServiceClient, p: ChatPhotographer, cap: number) {
  const month = monthKeyIsrael();
  const { data } = await supabase
    .from("photographers")
    .update({ intake_cap_full_alerted_month: month, intake_cap_alerted_month: month })
    .eq("id", p.id)
    .or(`intake_cap_full_alerted_month.is.null,intake_cap_full_alerted_month.neq.${month}`)
    .select("id");
  if (!data?.length) return;
  const extra = p.intake_extra_conversations ?? 0;
  const body =
    extra > 0
      ? `נוצלו כל ${cap} השיחות של החודש. העוזר ממשיך עם ${extra} השיחות שרכשת.`
      : `נוצלו כל ${cap} השיחות של החודש. מעכשיו לקוחות חדשים מקבלים טופס פנייה רגיל עד תחילת החודש הבא. אפשר לרכוש שיחות נוספות בהגדרות.`;
  await notifyUsage(p, "עוזר הפניות: המכסה החודשית נוצלה", body);
}

async function alertExtrasGone(p: ChatPhotographer, cap: number) {
  await notifyUsage(
    p,
    "עוזר הפניות: השיחות שרכשת נגמרו",
    `השתמשת בשיחה האחרונה שרכשת, ומכסת ${cap} השיחות של החודש כבר נוצלה. מעכשיו לקוחות חדשים מקבלים טופס פנייה רגיל עד תחילת החודש הבא, או עד שתרכוש שיחות נוספות בהגדרות.`
  );
}

// Phone and email: the email reaches a photographer who never turned notifications on.
async function notifyUsage(p: ChatPhotographer, title: string, body: string) {
  await sendPushToPhotographer(p.id, { title, body, url: "/settings?tab=automation", tag: "intake-cap" });
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://myframeflow.com"}/settings?tab=automation`;
  await sendEmail({ to: notificationEmailFor(p.email), subject: title, text: `שלום ${p.name},\n\n${body}\n\nהגדרות העוזר:\n${link}` }).catch((e) =>
    console.error("Intake usage email failed:", p.id, e)
  );
}

async function alertNearCap(supabase: ServiceClient, p: ChatPhotographer, used: number, cap: number) {
  const month = monthKeyIsrael();
  // Conditional update: only the request that flips the month sends, even if two run at once.
  const { data } = await supabase
    .from("photographers")
    .update({ intake_cap_alerted_month: month })
    .eq("id", p.id)
    .or(`intake_cap_alerted_month.is.null,intake_cap_alerted_month.neq.${month}`)
    .select("id");
  if (!data?.length) return;
  const left = Math.max(cap - used, 0);
  const extra = p.intake_extra_conversations ?? 0;
  await sendPushToPhotographer(p.id, {
    title: "עוזר הפניות: נוצלו 90% מהמכסה",
    body:
      `${used} מתוך ${cap} שיחות החודש. נשארו ${left}` +
      (extra > 0 ? `, ועוד ${extra} שיחות שרכשת.` : ". אחרי המכסה הלקוחות יקבלו טופס פנייה רגיל. אפשר לרכוש שיחות נוספות בהגדרות."),
    url: "/settings?tab=automation",
    tag: "intake-cap",
  });
}

export function monthStartIsrael(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const y = parts.find((x) => x.type === "year")!.value;
  const m = parts.find((x) => x.type === "month")!.value;
  // Midnight Israel time ≈ 21:00/22:00 UTC the day before; the 3-hour margin only ever counts a
  // few extra hours of the previous month, never misses this month's conversations.
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1) - 3 * 3600_000);
}
