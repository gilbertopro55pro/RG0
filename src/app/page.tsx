import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import { closingRecognitions, monthKeyIsrael } from "@/lib/closeEvent";
import { timeOfDayGreeting } from "@/lib/greeting";
import type {
  CustomPackageRow,
  EventPaymentRow,
  EventRow,
  EventStageRow,
  EventTypeRow,
  PackagePriceRow,
  Photographer,
  PriceQuoteRow,
  PriceQuoteTemplateRow,
  TeamMember,
} from "@/lib/types";
import LogoutButton from "@/components/LogoutButton";
import NewEventButton, { CalendarLink } from "@/components/DashboardActions";
import FeedbackButton from "@/components/FeedbackButton";
import PendingClientMessagePrompts, {
  type PendingPaymentReminder,
  type PendingReviewRequest,
  type PendingLeadFollowUp,
} from "@/components/PendingClientMessagePrompts";
import DashboardHero from "@/components/DashboardHero";
import QuickActionsGrid from "@/components/QuickActionsGrid";
import EventsListView, { type EventAttention } from "@/components/EventsListView";
import LandingPage from "@/components/LandingPage";
import SettingsGearLink from "@/components/SettingsGearLink";
import AlbumQuickAccessButton from "@/components/AlbumQuickAccessButton";

const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-out visitors get the marketing landing page instead of a bare redirect to /login —
  // this is now the page prospective photographers actually land on from ads/social links.
  if (!user) return <LandingPage />;

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
    { data: eventTypes },
    { data: prices },
    { data: payments },
    { data: scheduledReminders },
    { data: unreadNotifications },
    { data: priceQuotes },
    { data: priceQuoteTemplates },
    { data: contracts },
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
    supabase.from("event_types").select("*").order("sort_order", { ascending: true }).returns<EventTypeRow[]>(),
    supabase.from("package_prices").select("*").returns<PackagePriceRow[]>(),
    supabase.from("event_payments").select("*").returns<EventPaymentRow[]>(),
    supabase
      .from("scheduled_messages")
      .select("id, event_id, lead_id, kind, events(client_name), leads(name, phone, quoted_amount)")
      .in("kind", ["payment_reminder", "review_request", "lead_quote_followup"])
      .eq("status", "awaiting_confirmation")
      .returns<
        {
          id: string;
          event_id: string | null;
          lead_id: string | null;
          kind: "payment_reminder" | "review_request" | "lead_quote_followup";
          events: { client_name: string } | null;
          leads: { name: string; phone: string | null; quoted_amount: number | null } | null;
        }[]
      >(),
    // Powers the progress badge on each event card — only client-initiated steps (contract
    // signed, gallery selection) the photographer hasn't opened the event to see yet.
    supabase
      .from("event_notifications")
      .select("event_id")
      .eq("is_client_action", true)
      .is("read_at", null)
      .returns<{ event_id: string }[]>(),
    supabase.from("price_quotes").select("*").order("created_at", { ascending: false }).returns<PriceQuoteRow[]>(),
    supabase.from("price_quote_templates").select("*").order("created_at", { ascending: true }).returns<PriceQuoteTemplateRow[]>(),
    // Only for the "חוזה ממתין לחתימה" tag on the event list — status per event, newest first.
    supabase
      .from("event_contracts")
      .select("event_id, status, created_at")
      .order("created_at", { ascending: false })
      .returns<{ event_id: string; status: "draft" | "sent" | "signed"; created_at: string }[]>(),
  ]);

  if (!photographer && !teamMember) redirect("/login");
  if (photographer && photographer.subscription_status !== "active" && photographer.subscription_status !== "trialing") {
    redirect("/billing");
  }
  // First arrival on the dashboard after payment clears — a one-time "connect your calendar /
  // business ID / logo" screen, never shown again once completed (or dismissed) once.
  if (photographer && !photographer.onboarding_completed) {
    redirect("/onboarding");
  }

  // Visible only to the admin account, on their own dashboard — total signups across every
  // photographer, bypassing the per-photographer RLS that normally scopes this table to one row.
  let registeredUsersCount: number | null = null;
  if (photographer?.email === ADMIN_EMAIL) {
    const serviceRole = createServiceRoleClient();
    const { count } = await serviceRole.from("photographers").select("id", { count: "exact", head: true });
    registeredUsersCount = count ?? 0;
  }

  // Feeds the album-design quick-access dropdown below — published and draft galleries alike (an
  // album can be designed before the client-facing gallery ever goes live), excluding the hidden
  // portfolio-only gallery and anything archived.
  let albumQuickGalleries: { id: string; title: string; published: boolean; hasActiveAlbum: boolean }[] = [];
  if (photographer?.email === ADMIN_EMAIL) {
    const { data: galleriesForAlbum } = await supabase
      .from("galleries")
      .select("id, title, published")
      .eq("photographer_id", photographer.id)
      .eq("is_portfolio_only", false)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .returns<{ id: string; title: string; published: boolean }[]>();
    // hasActiveAlbum drives the quick-export shortcut in AlbumQuickAccessButton — a gallery only
    // gets one of these rows once the photographer has actually started designing its album (see
    // buildStyledAlbum/buildAlbumFromBookTemplate in GalleryManageView.tsx, both of which insert
    // this row the moment step 1 of the album wizard completes), so its mere existence is already
    // exactly "there's something to export," no need to also check it has real spreads/pages.
    const galleryIds = (galleriesForAlbum ?? []).map((g) => g.id);
    const { data: albumsForGalleries } =
      galleryIds.length > 0
        ? await supabase.from("gallery_albums").select("gallery_id").in("gallery_id", galleryIds).returns<{ gallery_id: string }[]>()
        : { data: [] as { gallery_id: string }[] };
    const galleriesWithAlbum = new Set((albumsForGalleries ?? []).map((a) => a.gallery_id));
    albumQuickGalleries = (galleriesForAlbum ?? []).map((g) => ({ ...g, hasActiveAlbum: galleriesWithAlbum.has(g.id) }));
  }

  const doneCountByEvent = new Map<string, number>();
  const totalCountByEvent = new Map<string, number>();
  events?.forEach((event) => {
    event.event_stages.forEach((s) => {
      totalCountByEvent.set(event.id, (totalCountByEvent.get(event.id) ?? 0) + 1);
      if (s.done) doneCountByEvent.set(event.id, (doneCountByEvent.get(event.id) ?? 0) + 1);
    });
  });

  const unreadCountByEvent = new Map<string, number>();
  (unreadNotifications ?? []).forEach((n) => {
    unreadCountByEvent.set(n.event_id, (unreadCountByEvent.get(n.event_id) ?? 0) + 1);
  });

  const isPhotographer = !!photographer;
  const displayName = photographer?.name ?? teamMember?.name ?? user?.email;

  // What on each event needs the photographer's attention, surfaced as tags on the event list so
  // it's visible without opening every event. Photographer-only (assistants don't handle money).
  const attentionByEvent: Record<string, EventAttention> = {};
  if (photographer) {
    const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const paymentByEvent = new Map((payments ?? []).map((p) => [p.event_id, p]));
    const latestContractStatus = new Map<string, string>();
    (contracts ?? []).forEach((c) => {
      if (!latestContractStatus.has(c.event_id)) latestContractStatus.set(c.event_id, c.status);
    });
    (events ?? []).forEach((event) => {
      if (event.closed_at) return;
      const attention: EventAttention = {};
      const p = paymentByEvent.get(event.id);
      if (p) {
        const depositLeft = p.deposit_paid ? 0 : Number(p.deposit_amount) - Number(p.deposit_paid_amount ?? 0);
        const balanceLeft = p.balance_paid ? 0 : Number(p.balance_amount) - Number(p.balance_paid_amount ?? 0);
        // Before the event only a missing deposit is actionable (the balance is normally paid on the
        // day); once the date has passed, anything still unpaid is.
        if (event.event_date < todayIso) {
          if (depositLeft + balanceLeft > 0) attention.openBalance = depositLeft + balanceLeft;
        } else if (depositLeft > 0) {
          attention.depositDue = depositLeft;
        }
      }
      if (latestContractStatus.get(event.id) === "sent") attention.contractPending = true;
      if (attention.openBalance || attention.depositDue || attention.contractPending) attentionByEvent[event.id] = attention;
    });
  }

  let heroData: { monthLabel: string; monthTotal: number; monthForecast: number } | null = null;
  if (photographer) {
    const revenueByMonth = new Map<string, number>();
    // A partial payment (deposit_paid/balance_paid still false, *_paid_amount set) counts only the
    // amount actually received as realized revenue for the month it was recorded in — not the full
    // original amount, which would overstate revenue for anyone paying in installments.
    (payments ?? []).forEach((p) => {
      if (p.deposit_paid_at) {
        const d = new Date(p.deposit_paid_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const received = p.deposit_paid ? Number(p.deposit_amount) : Number(p.deposit_paid_amount ?? 0);
        revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + received);
      }
      if (p.balance_paid_at) {
        const d = new Date(p.balance_paid_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const received = p.balance_paid ? Number(p.balance_amount) : Number(p.balance_paid_amount ?? 0);
        revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + received);
      }
    });

    const now = new Date();
    const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
    // Balance left unpaid at an event's closing counts as revenue in the month chosen/derived at
    // closing (see closeEvent.ts) — and, being recognized, is no longer part of the "still due"
    // forecast extra below, so it can't be counted twice.
    const recognitions = closingRecognitions(events ?? [], payments ?? []);
    const recognizedEventIds = new Set(recognitions.map((r) => r.eventId));
    const recognizedThisMonth = recognitions.filter((r) => r.month === monthKeyIsrael(now)).reduce((sum, r) => sum + r.amount, 0);
    const monthTotal = (revenueByMonth.get(currentKey) ?? 0) + recognizedThisMonth;

    // "Forecast for this month" = revenue already received this month, plus whatever's still
    // unpaid but due (balance_due_date) within this same month — the only due-date field the data
    // model has (EventPaymentRow has no separate deposit due date; AnalyticsView.tsx's own
    // upcoming-payments list uses balance_due_date for both legs the same way). An unpaid amount
    // with no due date at all can't be attributed to any specific month, so it's excluded here.
    let monthForecastExtra = 0;
    (payments ?? []).forEach((p) => {
      if (!p.balance_due_date) return;
      const due = new Date(p.balance_due_date);
      if (`${due.getFullYear()}-${due.getMonth()}` !== currentKey) return;
      if (!p.deposit_paid) monthForecastExtra += Number(p.deposit_amount) - Number(p.deposit_paid_amount ?? 0);
      if (!p.balance_paid && !recognizedEventIds.has(p.event_id)) monthForecastExtra += Number(p.balance_amount) - Number(p.balance_paid_amount ?? 0);
    });

    heroData = {
      monthLabel: HEBREW_MONTHS[now.getMonth()],
      monthTotal,
      monthForecast: monthTotal + monthForecastExtra,
    };
  }

  // Balance amounts come straight out of the `payments` batch already fetched above instead of
  // a further round trip keyed by reminder event ids.
  const balanceByEvent = new Map((payments ?? []).map((p) => [p.event_id, p.balance_amount]));
  const pendingReminders: PendingPaymentReminder[] = photographer
    ? (scheduledReminders ?? [])
        .filter((s) => s.kind === "payment_reminder")
        .map((s) => ({
          type: "payment" as const,
          id: s.id,
          clientName: s.events?.client_name ?? "לקוח",
          balanceAmount: (s.event_id ? balanceByEvent.get(s.event_id) : undefined) ?? 0,
        }))
    : [];
  const pendingReviewRequests: PendingReviewRequest[] = photographer
    ? (scheduledReminders ?? [])
        .filter((s) => s.kind === "review_request")
        .map((s) => ({ type: "review" as const, id: s.id, clientName: s.events?.client_name ?? "לקוח" }))
    : [];
  const pendingLeadFollowUps: PendingLeadFollowUp[] = photographer
    ? (scheduledReminders ?? [])
        .filter((s) => s.kind === "lead_quote_followup")
        .map((s) => ({
          type: "lead_followup" as const,
          id: s.id,
          leadName: s.leads?.name ?? "ליד",
          quotedAmount: s.leads?.quoted_amount ?? 0,
        }))
    : [];

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-24 w-full">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="text-[13px] text-ink-soft flex items-center gap-2">
            <span className="truncate">
              {timeOfDayGreeting()}, {displayName}
            </span>
            <LogoutButton />
          </div>
          <h1 className="text-[28px] leading-tight font-bold font-display mt-0.5">
            {isPhotographer ? "האירועים שלי" : "האירועים שהוקצו לי"}
          </h1>
        </div>
        {isPhotographer && (
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <CalendarLink />
            <SettingsGearLink />
          </div>
        )}
      </div>

      {isPhotographer && (
        <NewEventButton customPackages={customPackages ?? []} eventTypes={eventTypes ?? []} prices={prices ?? []} />
      )}

      {isPhotographer && heroData && (
        <DashboardHero
          monthLabel={heroData.monthLabel}
          monthTotal={heroData.monthTotal}
          monthForecast={heroData.monthForecast}
          registeredUsersCount={registeredUsersCount}
        />
      )}

      {isPhotographer && photographer && (
        <QuickActionsGrid
          hourlyRate={photographer.hourly_shoot_rate}
          suppliers={photographer.pricing_suppliers}
          priceQuotes={priceQuotes ?? []}
          templates={priceQuoteTemplates ?? []}
          eventTypes={(eventTypes ?? []).map((t) => ({ id: t.id, name: t.name }))}
          initialCustomEventTypes={photographer.quote_event_type_suggestions}
          defaultTaxStatus={photographer.business_tax_status}
        />
      )}

      {photographer?.email === ADMIN_EMAIL && (
        // Same total width (row + gap) as DashboardHero's card above — both are unconstrained
        // block-level children of this same padded container, so a plain flex row with gap-3
        // naturally lines up without any explicit width math.
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <a
            href="/magnet-frames"
            className="flex-1 min-w-0 flex items-center justify-between gap-3 rounded-2xl p-4 bg-card border border-line shadow-card"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg bg-amber-bg">🧲</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">עיצוב מסגרת מגנט</div>
                <div className="text-xs text-ink-soft truncate">בסיס לבן, טקסט ואלמנטים חופשי</div>
              </div>
            </div>
            <span className="text-ink-soft shrink-0">←</span>
          </a>
          <AlbumQuickAccessButton galleries={albumQuickGalleries} />
        </div>
      )}

      <EventsListView
        events={events ?? []}
        doneCountByEvent={Object.fromEntries(doneCountByEvent)}
        totalCountByEvent={Object.fromEntries(totalCountByEvent)}
        unreadCountByEvent={Object.fromEntries(unreadCountByEvent)}
        isPhotographer={isPhotographer}
        needsReviewColorId={photographer?.google_calendar_import_color_id}
        attentionByEvent={attentionByEvent}
      />
      <FeedbackButton />
      <PendingClientMessagePrompts
        paymentReminders={pendingReminders}
        reviewRequests={pendingReviewRequests}
        leadFollowUps={pendingLeadFollowUps}
      />
    </div>
  );
}
