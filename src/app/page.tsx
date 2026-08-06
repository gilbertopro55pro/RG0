import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timeOfDayGreeting } from "@/lib/greeting";
import type { CustomPackageRow, EventPaymentRow, EventRow, EventStageRow, Photographer, TeamMember } from "@/lib/types";
import LogoutButton from "@/components/LogoutButton";
import NewEventButton from "@/components/DashboardActions";
import FeedbackButton from "@/components/FeedbackButton";
import PaymentReminderPrompts, { type PendingPaymentReminder } from "@/components/PaymentReminderPrompts";
import DashboardHero from "@/components/DashboardHero";
import QuickActionsGrid from "@/components/QuickActionsGrid";
import EventsListView from "@/components/EventsListView";

const HEBREW_MONTHS_SHORT = [
  "ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ",
];

type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Every one of these is independent of the others' *values* — they only depend on user.id,
  // which we already have — so they're fired as a single parallel batch instead of five-plus
  // sequential round trips. RLS quietly returns empty results for tables a team-member account
  // shouldn't see, so it's safe to always fetch and just ignore what a given account can't use.
  // event_stages is embedded directly on the events query (one round trip) rather than fetched
  // separately by event_id afterward. This matters a lot here specifically because the Supabase
  // project region is far from where this app is deployed, so every extra sequential round trip
  // was adding real, visible load time.
  const [
    { data: photographer },
    { data: teamMember },
    { data: events },
    { data: customPackages },
    { data: payments },
    { data: scheduledReminders },
  ] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase.from("team_members").select("*").eq("id", user!.id).maybeSingle<TeamMember>(),
    // RLS scopes this to the photographer's own events, or a team member's assigned events
    supabase
      .from("events")
      .select("*, custom_packages(name), event_stages(event_id, done)")
      .order("event_date", { ascending: true })
      .returns<(EventWithCustomPackage & { event_stages: Pick<EventStageRow, "event_id" | "done">[] })[]>(),
    supabase.from("custom_packages").select("*").order("sort_order", { ascending: true }).returns<CustomPackageRow[]>(),
    supabase.from("event_payments").select("*").returns<EventPaymentRow[]>(),
    supabase
      .from("scheduled_messages")
      .select("id, event_id, events(client_name)")
      .eq("kind", "payment_reminder")
      .eq("status", "awaiting_confirmation")
      .returns<{ id: string; event_id: string; events: { client_name: string } | null }[]>(),
  ]);

  if (!photographer && !teamMember) redirect("/login");
  if (photographer && photographer.subscription_status !== "active" && photographer.subscription_status !== "trialing") {
    redirect("/billing");
  }

  const doneCountByEvent = new Map<string, number>();
  const totalCountByEvent = new Map<string, number>();
  events?.forEach((event) => {
    event.event_stages.forEach((s) => {
      totalCountByEvent.set(event.id, (totalCountByEvent.get(event.id) ?? 0) + 1);
      if (s.done) doneCountByEvent.set(event.id, (doneCountByEvent.get(event.id) ?? 0) + 1);
    });
  });

  const isPhotographer = !!photographer;
  const displayName = photographer?.name ?? teamMember?.name ?? user?.email;

  let heroData: { monthLabel: string; monthTotal: number; pendingTotal: number; trailing: { label: string; amount: number }[] } | null = null;
  if (photographer) {
    const revenueByMonth = new Map<string, number>();
    let pendingTotal = 0;
    (payments ?? []).forEach((p) => {
      if (p.deposit_paid_at) {
        const d = new Date(p.deposit_paid_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(p.deposit_amount));
      } else {
        pendingTotal += Number(p.deposit_amount);
      }
      if (p.balance_paid_at) {
        const d = new Date(p.balance_paid_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(p.balance_amount));
      } else {
        pendingTotal += Number(p.balance_amount);
      }
    });

    const now = new Date();
    const trailing: { label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      trailing.push({ label: HEBREW_MONTHS_SHORT[d.getMonth()], amount: revenueByMonth.get(key) ?? 0 });
    }
    const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
    heroData = {
      monthLabel: HEBREW_MONTHS_SHORT[now.getMonth()],
      monthTotal: revenueByMonth.get(currentKey) ?? 0,
      pendingTotal,
      trailing,
    };
  }

  // Balance amounts come straight out of the `payments` batch already fetched above instead of
  // a further round trip keyed by reminder event ids.
  const balanceByEvent = new Map((payments ?? []).map((p) => [p.event_id, p.balance_amount]));
  const pendingReminders: PendingPaymentReminder[] = photographer
    ? (scheduledReminders ?? []).map((s) => ({
        id: s.id,
        clientName: s.events?.client_name ?? "לקוח",
        balanceAmount: balanceByEvent.get(s.event_id) ?? 0,
      }))
    : [];

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs tracking-wide text-ink-soft flex items-center gap-2">
            <span>
              {timeOfDayGreeting()}, {displayName}
            </span>
            <LogoutButton />
          </div>
          <h1 className="text-[26px] font-extrabold mt-0.5 font-display">
            {isPhotographer ? "האירועים שלי" : "האירועים שהוקצו לי"}
          </h1>
        </div>
        {isPhotographer && <NewEventButton customPackages={customPackages ?? []} />}
      </div>

      {isPhotographer && heroData && (
        <DashboardHero
          monthLabel={heroData.monthLabel}
          monthTotal={heroData.monthTotal}
          pendingTotal={heroData.pendingTotal}
          trailing={heroData.trailing}
        />
      )}

      {isPhotographer && <QuickActionsGrid />}

      <EventsListView
        events={events ?? []}
        doneCountByEvent={Object.fromEntries(doneCountByEvent)}
        totalCountByEvent={Object.fromEntries(totalCountByEvent)}
        isPhotographer={isPhotographer}
      />
      <FeedbackButton />
      <PaymentReminderPrompts reminders={pendingReminders} />
    </div>
  );
}
