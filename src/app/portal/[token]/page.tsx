import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { PACKAGE_FLOWS, PACKAGE_LABELS, STAGE_LABELS, STAGE_TYPE, currentStageIndex, type StageKey } from "@/lib/stages";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import type { CustomPackageStageRow, EventPaymentRow, EventRow, EventStageRow, GalleryRow } from "@/lib/types";
import PortalStageActions from "@/components/PortalStageActions";
import { stageRole } from "@/lib/clientReminders";
import { getSignedDownloadUrl } from "@/lib/storage";
import { clientLangFor } from "@/lib/clientLang";
import ClientLangScope from "@/i18n/ClientLangScope";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: event } = await supabase
    .from("events")
    .select("*, photographers(name, phone, email)")
    .eq("client_access_token", token)
    .maybeSingle<EventRow & { photographers: { name: string; phone: string; email: string } | null }>();

  if (!event) {
    // No event → no photographer to read a client language from: Hebrew, as before.
    return (
      <ClientLangScope lang="he">
        <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
          <p className="text-sm text-ink-soft">הקישור שגוי או שפג תוקפו.</p>
        </div>
      </ClientLangScope>
    );
  }

  // UI languages phase 2: the client's language from the event (admin account only for now; every
  // other photographer's clients always get Hebrew). WhatsApp bodies the client sends stay Hebrew.
  const lang = clientLangFor(event.photographers?.email, event.client_lang);
  const t = makeT(messagesFor(lang));
  const locale = dateLocale(lang);

  const [{ data: stages }, { data: payments }, { data: customStagesData }, { data: customPackageData }, { data: gallery }] =
    await Promise.all([
      supabase
        .from("event_stages")
        .select("*")
        .eq("event_id", event.id)
        .order("stage_order", { ascending: true })
        .returns<EventStageRow[]>(),
      supabase.from("event_payments").select("*").eq("event_id", event.id).maybeSingle<EventPaymentRow>(),
      event.custom_package_id
        ? supabase
            .from("custom_package_stages")
            .select("*")
            .eq("package_id", event.custom_package_id)
            .order("sort_order", { ascending: true })
            .returns<CustomPackageStageRow[]>()
        : Promise.resolve({ data: [] as CustomPackageStageRow[] }),
      event.custom_package_id
        ? supabase.from("custom_packages").select("name").eq("id", event.custom_package_id).maybeSingle<{ name: string }>()
        : Promise.resolve({ data: null }),
      supabase
        .from("galleries")
        .select("access_token, published, archived_at")
        .eq("event_id", event.id)
        .maybeSingle<Pick<GalleryRow, "access_token" | "published" | "archived_at">>(),
    ]);

  const galleryLink = gallery && gallery.published && !gallery.archived_at ? `/gallery/${gallery.access_token}` : null;

  let albumDesignUrl: string | null = null;
  if (event.album_design_pdf_path) {
    albumDesignUrl = await getSignedDownloadUrl("album-designs", event.album_design_pdf_path, 3600);
  }

  const whatsappSongLink = event.photographers?.phone
    ? `https://wa.me/${normalizeIsraeliPhone(event.photographers.phone)}?text=${encodeURIComponent(
        `היי! רציתי לשלוח את השיר לקליפ עבור האירוע של ${event.client_name}: `
      )}`
    : null;

  const allStages = stages ?? [];
  const curIdx = currentStageIndex(allStages);
  const byKey = new Map(allStages.map((s) => [s.stage_key ?? `custom:${s.custom_stage_id}`, s]));

  // Client-facing view hides internal-only stages (culling, backup, etc.) — the client only cares
  // about checkpoints that involve them or mark real progress.
  // A custom package's stages come from the event's own rows, in order: the fixed stages every
  // package starts with (event closing, shoot day) are built-in rows, the rest the package's own.
  const customById = new Map((customStagesData ?? []).map((cs) => [cs.id, cs]));
  const clientStages = event.custom_package_id
    ? allStages
        .map((st, i) => {
          if (st.stage_key) {
            const key = st.stage_key as StageKey;
            return { key: key as string, label: t(STAGE_LABELS[key]), stage: st, index: i, notify: STAGE_TYPE[key] === "checkpoint", role: stageRole(key) };
          }
          const cs = customById.get(st.custom_stage_id ?? "");
          return cs
            ? { key: `custom:${cs.id}`, label: cs.name /* typed by the photographer: as is */, stage: st, index: i, notify: cs.notify_client, role: stageRole(null, cs) }
            : null;
        })
        .filter((s): s is NonNullable<typeof s> => !!s && s.notify)
    : PACKAGE_FLOWS[event.package!]
        .map((key, i) => ({ key, label: t(STAGE_LABELS[key]), stage: byKey.get(key)!, index: i, role: stageRole(key) }))
        .filter(({ key }) => STAGE_TYPE[key] === "checkpoint");
  // The client's own approval / song choice (lib/clientReminders.ts). A custom album stage is
  // marked done when the photographer uploads the PDF, so for it only the client's approval counts.
  const clientDone = (s: (typeof clientStages)[number]) =>
    s.role === "album_approval"
      ? !!event.album_approved_at || (!s.key.startsWith("custom:") && s.stage.done)
      : s.role === "client_song_selection"
        ? s.stage.done || !!event.songs_chosen_at
        : s.stage.done;

  return (
    <ClientLangScope lang={lang}>
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <h1 className="text-[22px] font-bold mb-1 font-display">{event.client_name}</h1>
      <p className="text-xs mb-5 text-ink-soft">
        {new Date(event.event_date).toLocaleDateString(locale)},{" "}
        {event.package ? t(PACKAGE_LABELS[event.package]) : (customPackageData?.name ?? t("חבילה מותאמת אישית"))}
      </p>

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold mb-3.5">{t("סטטוס האירוע")}</div>
        <PortalStageActions
          eventToken={token}
          stages={clientStages.map((s) => ({
            key: s.key,
            role: s.role,
            label: s.label,
            done: clientDone(s),
            isCurrent: s.index === curIdx,
          }))}
          galleryLink={galleryLink}
          albumDesignUrl={albumDesignUrl}
          whatsappLink={whatsappSongLink}
        />
      </div>

      {/* Freelance bookings are a single flat rate for raw work, not the deposit/balance split
          real events have — showing this section there would just be confusing/irrelevant. */}
      {payments && !event.package?.startsWith("freelance_") && (
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
          <div className="text-sm font-semibold mb-3.5">{t("תשלומים")}</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5 bg-chip">
              <span>{t("מקדמה: ₪{amount}", { amount: Number(payments.deposit_amount).toLocaleString(locale) })}</span>
              <span style={{ color: payments.deposit_paid ? "var(--color-sage)" : "var(--color-ink-soft)", fontWeight: 600 }}>
                {payments.deposit_paid ? t("שולם ✓") : t("ממתין")}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5 bg-chip">
              <span>{t("יתרה: ₪{amount}", { amount: Number(payments.balance_amount).toLocaleString(locale) })}</span>
              <span style={{ color: payments.balance_paid ? "var(--color-sage)" : "var(--color-ink-soft)", fontWeight: 600 }}>
                {payments.balance_paid
                  ? t("שולם ✓")
                  : payments.balance_due_date
                    ? t("עד {date}", { date: new Date(payments.balance_due_date).toLocaleDateString(locale) })
                    : t("ממתין")}
              </span>
            </div>
          </div>
        </div>
      )}

      {event.photographers?.phone && (
        <a
          href={`https://wa.me/${normalizeIsraeliPhone(event.photographers.phone)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl p-3.5 mt-5 text-sm font-semibold bg-sage-bg text-sage"
        >
          {t("יש שאלה? שליחת הודעה ל{name} בוואטסאפ", { name: event.photographers.name })}
        </a>
      )}
    </div>
    </ClientLangScope>
  );
}
