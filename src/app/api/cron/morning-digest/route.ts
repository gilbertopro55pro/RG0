import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ACCESS_COLUMNS, isLockedOut, type AccessRow } from "@/lib/appAccess";
import { photographerLang } from "@/lib/clientLang";
import { sendPushToPhotographer } from "@/lib/push";
import { israelToday } from "@/lib/tasks";
import { digestDueWindow, israelMinutes, morningDigest, nextShoot, type DigestEvent } from "@/lib/morningDigest";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Every half hour (vercel.json): the daily tasks reminder with the day's tasks and the next shoot
// (lib/morningDigest.ts), to each photographer whose chosen time (morning_digest_minutes, Israel
// time) has come. Only photographers with a phone registered for notifications and morning_digest
// on; claimed with morning_digest_sent_on first, so it goes out once a day even when runs are late
// or overlap.

type Row = AccessRow & { id: string; ui_lang: string | null; morning_digest_minutes: number };

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const today = israelToday(now);
  const due = digestDueWindow(israelMinutes(now));
  const supabase = createServiceRoleClient();

  const { data: subs, error: subsError } = await supabase.from("push_subscriptions").select("photographer_id").returns<{ photographer_id: string }[]>();
  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 500 });
  const ids = [...new Set((subs ?? []).map((s) => s.photographer_id))];
  if (!ids.length) return NextResponse.json({ sent: 0 });

  const { data: photographers, error } = await supabase
    .from("photographers")
    .select(`id, ui_lang, morning_digest_minutes, ${ACCESS_COLUMNS}`)
    .in("id", ids)
    .eq("morning_digest", true)
    .gte("morning_digest_minutes", due.from)
    .lte("morning_digest_minutes", due.to)
    .or(`morning_digest_sent_on.is.null,morning_digest_sent_on.lt.${today}`)
    .returns<Row[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let quiet = 0;
  for (const p of photographers ?? []) {
    if (isLockedOut(p, now)) continue;
    const { data: claimed } = await supabase
      .from("photographers")
      .update({ morning_digest_sent_on: today })
      .eq("id", p.id)
      .or(`morning_digest_sent_on.is.null,morning_digest_sent_on.lt.${today}`)
      .select("id");
    if (!claimed?.length) continue;
    const [{ data: tasks }, { data: events }] = await Promise.all([
      supabase
        .from("tasks")
        .select("title, task_date")
        .eq("user_id", p.id)
        .eq("done", false)
        .lte("task_date", today)
        .order("task_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50)
        .returns<{ title: string; task_date: string }[]>(),
      supabase
        .from("events")
        .select("client_name, event_date, event_start_time, closed_at, event_stages(stage_key, done)")
        .eq("photographer_id", p.id)
        .is("closed_at", null)
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(20)
        .returns<DigestEvent[]>(),
    ]);
    const lang = photographerLang(p.ui_lang);
    const message = morningDigest({ tasks: tasks ?? [], event: nextShoot(events ?? [], today), today, t: makeT(messagesFor(lang)), locale: dateLocale(lang), minutes: p.morning_digest_minutes });
    if (!message) {
      quiet++;
      continue;
    }
    sent += await sendPushToPhotographer(p.id, { ...message, url: "/?tasks=1", tag: "morning-digest" });
  }
  return NextResponse.json({ sent, quiet });
}
