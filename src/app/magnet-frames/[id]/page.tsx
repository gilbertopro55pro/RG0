import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { designToolsAllowed } from "@/lib/designTools";
import { hasAppAccess } from "@/lib/subscription";
import { addDaysIso, israelTodayIso } from "@/lib/shootDayReminder";
import type { EventRow, Photographer } from "@/lib/types";
import MagnetFrameEditor from "@/components/MagnetFrameEditor";
import BackLink from "@/components/BackLink";
import { getT } from "@/i18n/server";

type EventPick = Pick<EventRow, "id" | "client_name" | "event_date">;

// "2026-06-12" → "12.6.2026".
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

// One magnet frame in the editor (פרו / פרו+, designToolsAllowed, same rule as the album designer).
// The frames list is /magnet-frames.
export default async function MagnetFrameEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getT();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: photographer } = await supabase.from("photographers").select("*").eq("id", user.id).maybeSingle<Photographer>();
  if (!photographer || !designToolsAllowed(photographer)) redirect("/");
  if (photographer.email !== ADMIN_EMAIL && !hasAppAccess(photographer)) redirect("/billing");

  const today = israelTodayIso();
  const fields = "id, client_name, event_date";
  // Events the frame can be linked to: the upcoming ones first, then the last 60 days.
  const [{ data: design }, { data: upcoming }, { data: past }] = await Promise.all([
    supabase.from("magnet_frame_designs").select("id, event_id").eq("id", id).eq("photographer_id", user.id).maybeSingle<{ id: string; event_id: string | null }>(),
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
  if (!design) redirect("/magnet-frames");

  const picks = [...(upcoming ?? []), ...(past ?? [])].slice(0, 80);
  // The frame's own event stays in the list even when it's older than the list goes.
  if (design.event_id && !picks.some((e) => e.id === design.event_id)) {
    const { data: linked } = await supabase.from("events").select(fields).eq("id", design.event_id).eq("photographer_id", user.id).maybeSingle<EventPick>();
    if (linked) picks.unshift(linked);
  }
  const events = picks.map((e) => ({ id: e.id, label: `${e.client_name} · ${shortDate(e.event_date)}` }));

  return (
    // The editor renders its own title row (title, help, save) and sizes itself to the screen, so the
    // bottom padding stays small: the page itself doesn't scroll.
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-5 [@media(max-height:500px)]:pt-2 pb-4 w-full">
      {/* On a short screen (a phone held sideways) the editor's title row carries its own back arrow. */}
      <BackLink href="/magnet-frames" label={t("לכל המסגרות")} className="mb-3 [@media(max-height:500px)]:hidden" />
      <MagnetFrameEditor designId={id} events={events} portfolioSlug={photographer.portfolio_slug ?? null} />
    </div>
  );
}
