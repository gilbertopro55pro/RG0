import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COLUMNS, isLockedOut, type AccessRow } from "@/lib/appAccess";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { LEAD_FOLLOW_UP_TEMPLATES } from "@/lib/stages";
import { friendlyWhatsAppError, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { clientLangFor, photographerLang } from "@/lib/clientLang";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";
import { reminderStillNeeded, type ClientReminderKind } from "@/lib/clientReminders";
import { sendPushToPhotographer } from "@/lib/push";
import { SHOOT_DAY_REMINDER_DAYS, addDaysIso, daysBetweenIso, israelTodayIso, shootDayReminderDue, type ShootDayCandidate } from "@/lib/shootDayReminder";
import { filmReminderBlocks, openSongStage, roleStages, songStageReminderDue, SONG_STAGE_REMINDER_EVERY_DAYS, type SongStageCandidate } from "@/lib/songStageReminder";
import { STAGE_LABELS } from "@/lib/stages";

type ScheduledMessage = {
  id: string;
  event_id: string | null;
  lead_id: string | null;
  kind: "review_request" | "payment_reminder" | "lead_follow_up" | "lead_quote_followup" | "shoot_day_reminder" | "song_stage_reminder" | ClientReminderKind;
  sequence_step: number | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: due } = await supabase
    .from("scheduled_messages")
    .select("id, event_id, lead_id, kind, sequence_step, created_at")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .returns<ScheduledMessage[]>();

  const results = [];

  for (const message of due ?? []) {
    if (message.kind === "lead_follow_up") {
      results.push(await processLeadFollowUp(supabase, message));
      continue;
    }
    if (message.kind === "lead_quote_followup") {
      results.push(await processLeadQuoteFollowup(supabase, message));
      continue;
    }
    if (message.kind === "album_approval_reminder" || message.kind === "song_selection_reminder") {
      results.push(await processClientReminder(supabase, message, message.kind));
      continue;
    }

    const { data: event } = await supabase
      .from("events")
      .select("client_name, client_phone")
      .eq("id", message.event_id)
      .single<{ client_name: string; client_phone: string | null }>();

    if (!event?.client_phone) {
      await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
      results.push({ id: message.id, status: "failed", reason: "no client phone" });
      continue;
    }

    // Neither payment reminders nor review requests message the client directly from here —
    // both need a live browser to open the wa.me deep link, so this just flags them pending;
    // the photographer taps to actually send from the dashboard prompt (see
    // PaymentReminderPrompts.tsx / ReviewRequestPrompts.tsx and their confirm routes).
    const pendingText =
      message.kind === "payment_reminder"
        ? "הגיע מועד תזכורת התשלום, ממתין לאישורך שהיתרה עדיין לא שולמה"
        : "הגיע מועד בקשת הביקורת, ממתין לאישורך לשליחה";
    await supabase.from("scheduled_messages").update({ status: "awaiting_confirmation" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({ event_id: message.event_id, text: pendingText });
    results.push({ id: message.id, status: "awaiting_confirmation" });
  }

  const shootDay = await processShootDayReminders(supabase).catch((e) => {
    console.error("Shoot day reminders failed:", e);
    return { error: e instanceof Error ? e.message : "unknown" };
  });

  const songStage = await processSongStageReminders(supabase).catch((e) => {
    console.error("Song stage reminders failed:", e);
    return { error: e instanceof Error ? e.message : "unknown" };
  });

  return NextResponse.json({ processed: results.length, results, shootDay, songStage });
}

type SongStageEvent = SongStageCandidate & {
  id: string;
  client_name: string;
  photographer_id: string;
  event_stages: { stage_key: string | null; custom_stage_id: string | null; done: boolean; stage_order: number }[];
  photographers: (AccessRow & { song_stage_reminder: boolean; ui_lang: string | null }) | null;
};

// While the clip song-selection stage is the current stage or was left open (lib/songStageReminder.ts,
// owner 2026-10-25): a reminder to the photographer to ask the client for the songs. The row waits
// for the photographer (awaiting_confirmation) with a phone notification; the home screen opens the
// song stage's message. A waiting reminder whose stage isn't open any more (songs chosen, stage
// marked, event closed, reminder switched off) is closed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processSongStageReminders(supabase: SupabaseClient<any>) {
  const today = israelTodayIso();
  const { data: events } = await supabase
    .from("events")
    .select(`id, client_name, client_phone, needs_review, closed_at, songs_chosen_at, photographer_id, event_stages(stage_key, custom_stage_id, done, stage_order), photographers!inner(${ACCESS_COLUMNS}, song_stage_reminder, ui_lang)`)
    .eq("photographers.song_stage_reminder", true)
    .is("closed_at", null)
    .is("songs_chosen_at", null)
    .gte("event_date", addDaysIso(today, -365))
    .lte("event_date", today)
    .returns<SongStageEvent[]>();
  const live = (events ?? []).filter((e) => !isLockedOut(e.photographers));

  const customIds = [...new Set(live.flatMap((e) => e.event_stages.map((s) => s.custom_stage_id)).filter((id): id is string => !!id))];
  const { data: customs } = customIds.length
    ? await supabase.from("custom_package_stages").select("id, name, requires_album_pdf").in("id", customIds).returns<{ id: string; name: string; requires_album_pdf: boolean | null }[]>()
    : { data: [] as { id: string; name: string; requires_album_pdf: boolean | null }[] };
  const customById = new Map((customs ?? []).map((c) => [c.id, c]));
  const open = live
    .map((e) => ({ event: e, stages: roleStages(e.event_stages, customById, STAGE_LABELS) }))
    .filter(({ stages }) => !!openSongStage(stages));

  const openIds = new Set(open.map((o) => o.event.id));
  const { data: waiting } = await supabase
    .from("scheduled_messages")
    .select("id, event_id")
    .eq("kind", "song_stage_reminder")
    .eq("status", "awaiting_confirmation")
    .returns<{ id: string; event_id: string }[]>();
  const stale = (waiting ?? []).filter((r) => !openIds.has(r.event_id)).map((r) => r.id);
  if (stale.length) await supabase.from("scheduled_messages").update({ status: "canceled" }).in("id", stale);
  if (!open.length) return { created: 0, stale: stale.length };

  const ids = [...openIds];
  const since = new Date(Date.now() - SONG_STAGE_REMINDER_EVERY_DAYS * 86_400_000).toISOString();
  const [{ data: earlier }, { data: sentByHand }] = await Promise.all([
    supabase
      .from("scheduled_messages")
      .select("event_id, kind, status, send_at")
      .in("kind", ["song_stage_reminder", "song_selection_reminder"])
      .in("event_id", ids)
      .returns<{ event_id: string; kind: string; status: string; send_at: string }[]>(),
    // The event page's send logs `בנוגע לשלב "<the stage's name>"` (api/events/[id]/notify).
    supabase
      .from("event_notifications")
      .select("event_id, text")
      .in("event_id", ids)
      .like("text", "%בנוגע לשלב%")
      .gte("created_at", since)
      .returns<{ event_id: string; text: string }[]>(),
  ]);

  let created = 0;
  for (const { event, stages } of open) {
    const song = openSongStage(stages)!;
    const rows = (earlier ?? []).filter((r) => r.event_id === event.id);
    const handSent = (sentByHand ?? []).some((n) => n.event_id === event.id && n.text.includes(`בנוגע לשלב "${song.label}"`));
    const recentlyAsked = handSent || filmReminderBlocks(rows.filter((r) => r.kind === "song_selection_reminder"));
    const before = rows.filter((r) => r.kind === "song_stage_reminder").map((r) => r.send_at);
    if (!songStageReminderDue(event, stages, before, recentlyAsked)) continue;
    const { error } = await supabase
      .from("scheduled_messages")
      .insert({ event_id: event.id, kind: "song_stage_reminder", status: "awaiting_confirmation", send_at: new Date().toISOString() });
    if (error) {
      console.error("Song stage reminder insert failed:", error.message);
      continue;
    }
    created++;
    // Activity log (stored, Hebrew like every other log line).
    await supabase.from("event_notifications").insert({
      event_id: event.id,
      text: "שלב בחירת השירים לקליפ פתוח. ממתין לאישורך לשליחת תזכורת ללקוח לבחור שירים",
    });
    const t = makeT(messagesFor(photographerLang(event.photographers?.ui_lang)));
    await sendPushToPhotographer(event.photographer_id, {
      title: t("{name} עוד לא בחרו שירים לקליפ", { name: event.client_name }),
      body: t("לחצו לשליחת תזכורת ללקוח בוואטסאפ"),
      url: "/",
      tag: `song_stage_reminder-${event.id}`,
    });
  }
  return { created, stale: stale.length };
}

type ShootDayEvent = ShootDayCandidate & {
  id: string;
  client_name: string;
  photographer_id: string;
  photographers: (AccessRow & { shoot_day_reminder: boolean; ui_lang: string | null }) | null;
};

// 1–3 days before an event (lib/shootDayReminder.ts): a reminder to send the client the "יום הצילום"
// message saved in the client messages settings (owner, 2026-10-22). The row waits for the
// photographer (awaiting_confirmation) with a phone notification; the home screen opens the message
// window. A reminder left unanswered after its event day is closed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processShootDayReminders(supabase: SupabaseClient<any>) {
  const today = israelTodayIso();
  const { data: stale } = await supabase
    .from("scheduled_messages")
    .select("id, events!inner(event_date)")
    .eq("kind", "shoot_day_reminder")
    .eq("status", "awaiting_confirmation")
    .lt("events.event_date", today)
    .returns<{ id: string }[]>();
  if (stale?.length) await supabase.from("scheduled_messages").update({ status: "canceled" }).in("id", stale.map((r) => r.id));

  const { data: events } = await supabase
    .from("events")
    .select(`id, client_name, client_phone, event_date, is_freelance, needs_review, closed_at, photographer_id, event_stages(stage_key, done), photographers!inner(${ACCESS_COLUMNS}, shoot_day_reminder, ui_lang)`)
    .gte("event_date", addDaysIso(today, 1))
    .lte("event_date", addDaysIso(today, SHOOT_DAY_REMINDER_DAYS))
    .eq("photographers.shoot_day_reminder", true)
    .not("client_phone", "is", null)
    .returns<ShootDayEvent[]>();
  const candidates = (events ?? []).filter((e) => !isLockedOut(e.photographers));
  if (!candidates.length) return { created: 0, stale: stale?.length ?? 0 };
  const ids = candidates.map((e) => e.id);

  const [{ data: earlier }, { data: sentByHand }] = await Promise.all([
    supabase.from("scheduled_messages").select("event_id, send_at").eq("kind", "shoot_day_reminder").in("event_id", ids).returns<{ event_id: string; send_at: string }[]>(),
    // The event page's send logs `בנוגע לשלב "יום הצילום"` (api/events/[id]/notify).
    supabase
      .from("event_notifications")
      .select("event_id")
      .in("event_id", ids)
      .like("text", '%בנוגע לשלב "יום הצילום"%')
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .returns<{ event_id: string }[]>(),
  ]);
  const handSent = new Set((sentByHand ?? []).map((n) => n.event_id));

  let created = 0;
  for (const event of candidates) {
    const before = (earlier ?? []).filter((r) => r.event_id === event.id).map((r) => r.send_at);
    if (!shootDayReminderDue(event, today, before, handSent.has(event.id))) continue;
    const { error } = await supabase
      .from("scheduled_messages")
      .insert({ event_id: event.id, kind: "shoot_day_reminder", status: "awaiting_confirmation", send_at: new Date().toISOString() });
    if (error) {
      console.error("Shoot day reminder insert failed:", error.message);
      continue;
    }
    created++;
    const days = daysBetweenIso(today, event.event_date);
    // Activity log (stored, Hebrew like every other log line).
    await supabase.from("event_notifications").insert({
      event_id: event.id,
      text: `בעוד ${days} ימים יום הצילום. ממתין לאישורך לשליחת הודעת יום הצילום ללקוח`,
    });
    const t = makeT(messagesFor(photographerLang(event.photographers?.ui_lang)));
    await sendPushToPhotographer(event.photographer_id, {
      title:
        days === 1
          ? t("מחר הצילום של {name}", { name: event.client_name })
          : t("בעוד {days} ימים הצילום של {name}", { days, name: event.client_name }),
      body: t("לחצו לשליחת הודעת יום הצילום ללקוח"),
      url: "/",
      tag: `shoot_day_reminder-${event.id}`,
    });
  }
  return { created, stale: stale?.length ?? 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processLeadFollowUp(supabase: SupabaseClient<any>, message: ScheduledMessage) {
  const { data: lead } = await supabase
    .from("leads")
    .select("name, phone, status, archived_at, photographers(email, subscription_status, trial_ends_at)")
    .eq("id", message.lead_id)
    .single<{ name: string; phone: string | null; status: string; archived_at: string | null; photographers: AccessRow | null }>();

  // The lead converted or died since this step was scheduled — nothing to send. This is a
  // defensive fallback; the normal path cancels these rows outright when status changes
  // (see cancelLeadFollowUps), so this should rarely actually trigger.
  if (!lead || lead.status === "won" || lead.status === "lost" || lead.archived_at) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return { id: message.id, status: "canceled", reason: "lead no longer active" };
  }
  if (!lead.phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return { id: message.id, status: "failed", reason: "no lead phone" };
  }
  // These go out from the platform's own WhatsApp number (Meta charges per conversation), so a
  // photographer whose trial ended or whose subscription lapsed gets none (lib/appAccess.ts).
  if (isLockedOut(lead.photographers)) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return { id: message.id, status: "canceled", reason: "subscription inactive" };
  }

  const step = LEAD_FOLLOW_UP_TEMPLATES[(message.sequence_step ?? 1) - 1];
  try {
    await sendWhatsAppTemplate(lead.phone, step.template, [lead.name]);
    await supabase
      .from("scheduled_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", message.id);
    return { id: message.id, status: "sent" };
  } catch (e) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return { id: message.id, status: "failed", reason: e instanceof Error ? e.message : "unknown" };
  }
}

type FollowUpLead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  event_date_interest: string | null;
  event_type_name: string | null;
  quoted_amount: number | null;
  status: string;
  photographer_id: string;
  quote_approved_at: string | null;
  archived_at: string | null;
  client_lang: string | null;
};

// Fires 2 days after a quote is sent from the leads page. Unlike processLeadFollowUp above, this
// notifies the PHOTOGRAPHER, not the lead — a free-form email carries the full name/phone/date/
// type/amount block (a WhatsApp Business template can't: Meta only approves templates with a
// fixed body and a handful of named variable slots, see src/lib/whatsapp.ts's comment on
// sendWhatsAppTemplate), and the dashboard "awaiting_confirmation" prompt gives the photographer
// a one-tap wa.me link to the lead itself, the same pattern payment/review reminders already use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processLeadQuoteFollowup(supabase: SupabaseClient<any>, message: ScheduledMessage) {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, email, event_date_interest, event_type_name, quoted_amount, status, photographer_id, archived_at, client_lang, quote_approved_at")
    .eq("id", message.lead_id)
    .single<FollowUpLead>();

  // An approved quote needs no nudge (the client was emailed "our quote is still open" after
  // approving it).
  if (!lead || lead.status === "won" || lead.status === "lost" || lead.archived_at || lead.quote_approved_at) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return { id: message.id, status: "canceled", reason: "lead no longer active" };
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("email, name, ui_lang")
    .eq("id", lead.photographer_id)
    .maybeSingle<{ email: string; name: string | null; ui_lang: string | null }>();

  if (photographer?.email) {
    // The reminder to the photographer, in their own language (photographers.ui_lang).
    const pLang = photographerLang(photographer.ui_lang);
    const pt = makeT(messagesFor(pLang));
    const amount = lead.quoted_amount ?? 0;
    const detailsBlock =
      `${pt("שם מלא: {v}", { v: lead.name })}\n` +
      `${pt("טלפון: {v}", { v: lead.phone ?? pt("לא צוין") })}\n` +
      `${pt("תאריך האירוע: {v}", { v: lead.event_date_interest ? new Date(lead.event_date_interest).toLocaleDateString(dateLocale(pLang)) : pt("לא צוין") })}\n` +
      `${pt("סוג האירוע: {v}", { v: lead.event_type_name ?? pt("לא צוין") })}\n` +
      pt("סכום ההצעה: {v}", { v: pLang === "he" ? `₪${amount}` : `₪${Number(amount).toLocaleString(dateLocale(pLang))}` });
    try {
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        subject: pt("תזכורת מעקב אחרי הצעת מחיר | {name}", { name: lead.name }),
        text: `${pt("שלום,")}\n\n${pt("עברו יומיים מאז שנשלחה הצעת מחיר ל{name} ועדיין לא התקבלה תשובה. כדאי לבצע פולואפ:", { name: lead.name })}\n\n${detailsBlock}\n\n${pt("אפשר לבצע את הפולואפ ישירות מהאפליקציה, בעמוד הלידים.")}`,
      });
    } catch (e) {
      console.error("Lead quote follow-up email to photographer failed:", e);
    }
  }

  // Bonus: a gentle automatic nudge straight to the client too, when we actually have an email
  // for them — free-form, so no WhatsApp-template limitation applies here.
  if (lead.email) {
    // In the lead's language (UI languages phase 3); "he" for every non-admin account.
    const t = makeT(messagesFor(clientLangFor(photographer?.email, lead.client_lang)));
    try {
      await sendEmail({
        to: lead.email,
        fromName: photographer?.name ?? undefined,
        replyTo: photographer?.email ? notificationEmailFor(photographer.email) : undefined,
        subject: t("רק מזכירים את ההצעה שלנו"),
        text: t("שלום {name},\n\nרצינו להזכיר שההצעת מחיר ששלחנו לכם עדיין פתוחה, ונשמח לעמוד לרשותכם לכל שאלה או לתיאום.", { name: lead.name }),
      });
    } catch (e) {
      console.error("Lead quote follow-up email to lead failed:", e);
    }
  }

  await supabase.from("scheduled_messages").update({ status: "awaiting_confirmation" }).eq("id", message.id);
  await supabase.from("event_notifications").insert({
    lead_id: lead.id,
    text: "הגיע מועד המעקב אחרי הצעת המחיר שנשלחה, ממתין לאישורך לשליחה בוואטסאפ",
  });

  return { id: message.id, status: "awaiting_confirmation" };
}

// 3 days after the album-design-ready / full-film-ready message (lib/clientReminders.ts): if the
// client still hasn't approved the album / picked the clip songs, tell the PHOTOGRAPHER (push +
// the dashboard prompt, which opens WhatsApp with a ready reminder to the client). Already done →
// canceled quietly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processClientReminder(supabase: SupabaseClient<any>, message: ScheduledMessage, kind: ClientReminderKind) {
  if (!message.event_id || !(await reminderStillNeeded(supabase, message.event_id, kind))) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return { id: message.id, status: "canceled", reason: "client already did it" };
  }
  const { data: event } = await supabase
    .from("events")
    .select("id, client_name, client_phone, photographer_id, photographers(ui_lang, album_approval_reminder)")
    .eq("id", message.event_id)
    .maybeSingle<{
      id: string;
      client_name: string;
      client_phone: string | null;
      photographer_id: string;
      photographers: { ui_lang: string | null; album_approval_reminder: boolean | null } | null;
    }>();
  // Switched off after it was scheduled (Settings › Notifications & automation).
  if (kind === "album_approval_reminder" && event?.photographers?.album_approval_reminder === false) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return { id: message.id, status: "canceled", reason: "reminder switched off" };
  }
  if (!event?.client_phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return { id: message.id, status: "failed", reason: "no client phone" };
  }

  await supabase.from("scheduled_messages").update({ status: "awaiting_confirmation" }).eq("id", message.id);
  const lang = photographerLang(event.photographers?.ui_lang);
  // The album reminder's days are the photographer's (1–14), so it names the send's date instead.
  const sentOn = new Date(message.created_at).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "numeric", timeZone: "Asia/Jerusalem" });
  const sentOnHe = new Date(message.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: "Asia/Jerusalem" });
  // Activity log (stored, Hebrew like every other log line).
  await supabase.from("event_notifications").insert({
    event_id: event.id,
    text: kind === "album_approval_reminder"
      ? `עיצוב האלבום שנשלח ב-${sentOnHe} עוד לא אושר. ממתין לאישורך לשליחת תזכורת ללקוח`
      : "עברו 3 ימים והלקוח עוד לא בחר שירים לקליפ. ממתין לאישורך לשליחת תזכורת",
  });
  const t = makeT(messagesFor(lang));
  await sendPushToPhotographer(event.photographer_id, {
    title: kind === "album_approval_reminder"
      ? t("{name} עוד לא אישרו את עיצוב האלבום", { name: event.client_name })
      : t("{name} עוד לא בחרו שירים לקליפ", { name: event.client_name }),
    body: kind === "album_approval_reminder"
      ? t("העיצוב נשלח ב-{date}. לחצו לשליחת תזכורת בוואטסאפ", { date: sentOn })
      : t("עברו 3 ימים מאז ההודעה. לחצו לשליחת תזכורת בוואטסאפ"),
    url: "/",
    tag: `${kind}-${event.id}`,
  });
  return { id: message.id, status: "awaiting_confirmation" };
}
