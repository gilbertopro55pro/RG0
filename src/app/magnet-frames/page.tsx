import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { ADMIN_EMAIL } from "@/lib/admin";
import { designToolsAllowed } from "@/lib/designTools";
import { magnetPortfolioSlug } from "@/lib/magnetQr";
import { hasAppAccess } from "@/lib/subscription";
import { addDaysIso, israelTodayIso } from "@/lib/shootDayReminder";
import type { EventRow, Photographer } from "@/lib/types";
import MagnetFramesList, { type MagnetFrameEventOption, type MagnetFrameListItem } from "@/components/magnetFrame/MagnetFramesList";
import BackLink from "@/components/BackLink";
import { getT } from "@/i18n/server";

type EventPick = Pick<EventRow, "id" | "client_name" | "event_date" | "event_type" | "client_phone" | "client_email">;
type DesignWithContact = MagnetFrameListItem & { event: (NonNullable<MagnetFrameListItem["event"]> & Pick<EventRow, "client_phone" | "client_email">) | null };

// "2026-06-12" → "12.6.2026".
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

// The photographer's magnet frames (several per account since 2026-10-22). פרו / פרו+
// (designToolsAllowed, same rule as the album designer). `?new=1&event=<id>` opens the new-frame
// dialog for that event (the link on the event page).
export default async function MagnetFramesPage({ searchParams }: { searchParams: Promise<{ new?: string; event?: string }> }) {
  const supabase = await createClient();
  const t = await getT();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: photographer } = await supabase.from("photographers").select("*").eq("id", user.id).maybeSingle<Photographer>();
  if (!photographer || !designToolsAllowed(photographer)) redirect("/");
  if (photographer.email !== ADMIN_EMAIL && !hasAppAccess(photographer)) redirect("/billing");

  const { new: openNew, event: newEventId } = await searchParams;
  const today = israelTodayIso();
  const fields = "id, client_name, event_date, event_type, client_phone, client_email";
  // Events to link a frame to: the upcoming ones first, then the last 60 days.
  const [{ data: designs }, { data: upcoming }, { data: past }] = await Promise.all([
    supabase
      .from("magnet_frame_designs")
      .select("*, event:events(id, client_name, event_date, client_phone, client_email)")
      .eq("photographer_id", user.id)
      .order("updated_at", { ascending: false })
      .returns<DesignWithContact[]>(),
    supabase.from("events").select(fields).eq("photographer_id", user.id).gte("event_date", today).order("event_date", { ascending: true }).limit(80).returns<EventPick[]>(),
    supabase
      .from("events")
      .select(fields)
      .eq("photographer_id", user.id)
      .lt("event_date", today)
      .gte("event_date", addDaysIso(today, -60))
      .order("event_date", { ascending: false })
      .limit(80)
      .returns<EventPick[]>(),
  ]);
  const picks = [...(upcoming ?? []), ...(past ?? [])].slice(0, 80);
  // The event the event page's link came from, even when it's older than the list goes.
  if (newEventId && !picks.some((e) => e.id === newEventId)) {
    const { data: linked } = await supabase.from("events").select(fields).eq("id", newEventId).eq("photographer_id", user.id).maybeSingle<EventPick>();
    if (linked) picks.unshift(linked);
  }
  // The events whose client can get a message (a phone or an email): "שליחה ללקוח לאישור" (stage 3).
  // Only this list goes to the page, not the phone numbers themselves.
  const hasContact = (e: Pick<EventRow, "client_phone" | "client_email"> | null) => !!(e?.client_phone?.trim() || e?.client_email?.trim());
  const contactEventIds = [...new Set([...(designs ?? []).flatMap((d) => (d.event && hasContact(d.event) ? [d.event.id] : [])), ...picks.filter(hasContact).map((e) => e.id)])];
  const listDesigns: MagnetFrameListItem[] = (designs ?? []).map((d) => ({
    ...d,
    event: d.event ? { id: d.event.id, client_name: d.event.client_name, event_date: d.event.event_date } : null,
  }));
  const events: MagnetFrameEventOption[] = picks.map((e) => ({
    id: e.id,
    label: `${e.client_name} · ${shortDate(e.event_date)}`,
    clientName: e.client_name,
    date: e.event_date,
    eventType: e.event_type,
  }));

  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <BackLink href="/" label={t("חזרה לדף הבית")} className="mb-5" />
      <MagnetFramesList
        initialDesigns={listDesigns}
        events={events}
        contactEventIds={contactEventIds}
        today={today}
        openNewForEvent={openNew === "1" ? (events.some((e) => e.id === newEventId) ? newEventId! : "") : null}
        portfolioSlug={magnetPortfolioSlug(photographer)}
      />
    </div>
  );
}
