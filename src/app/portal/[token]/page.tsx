import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { PACKAGE_FLOWS, STAGE_LABELS, STAGE_TYPE, currentStageIndex, packageLabel } from "@/lib/stages";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import type { CustomPackageStageRow, EventPaymentRow, EventRow, EventStageRow, GalleryRow } from "@/lib/types";
import PortalStageActions from "@/components/PortalStageActions";
import { getSignedDownloadUrl } from "@/lib/storage";

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: event } = await supabase
    .from("events")
    .select("*, photographers(name, phone)")
    .eq("client_access_token", token)
    .maybeSingle<EventRow & { photographers: { name: string; phone: string } | null }>();

  if (!event) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
        <p className="text-sm text-ink-soft">הקישור שגוי או שפג תוקפו.</p>
      </div>
    );
  }

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
  const clientStages = event.custom_package_id
    ? (customStagesData ?? [])
        .map((cs, i) => ({ key: `custom:${cs.id}`, label: cs.name, stage: byKey.get(`custom:${cs.id}`)!, index: i, notify: cs.notify_client }))
        .filter((s) => s.notify)
    : PACKAGE_FLOWS[event.package!]
        .map((key, i) => ({ key, label: STAGE_LABELS[key], stage: byKey.get(key)!, index: i }))
        .filter(({ key }) => STAGE_TYPE[key] === "checkpoint");

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <h1 className="text-[22px] font-bold mb-1 font-display">{event.client_name}</h1>
      <p className="text-xs mb-5 text-ink-soft">
        {new Date(event.event_date).toLocaleDateString("he-IL")} · {packageLabel(event.package, customPackageData?.name)}
      </p>

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-3.5">סטטוס האירוע</div>
        <PortalStageActions
          eventToken={token}
          stages={clientStages.map(({ key, label, stage, index }) => ({
            key,
            label,
            done: stage.done,
            isCurrent: index === curIdx,
          }))}
          galleryLink={galleryLink}
          albumDesignUrl={albumDesignUrl}
          whatsappLink={whatsappSongLink}
        />
      </div>

      {payments && (
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
          <div className="text-sm font-semibold tracking-wide mb-3.5">תשלומים</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5 bg-chip">
              <span>מקדמה — ₪{payments.deposit_amount}</span>
              <span style={{ color: payments.deposit_paid ? "var(--color-sage)" : "var(--color-ink-soft)", fontWeight: 600 }}>
                {payments.deposit_paid ? "שולם ✓" : "ממתין"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5 bg-chip">
              <span>יתרה — ₪{payments.balance_amount}</span>
              <span style={{ color: payments.balance_paid ? "var(--color-sage)" : "var(--color-ink-soft)", fontWeight: 600 }}>
                {payments.balance_paid
                  ? "שולם ✓"
                  : payments.balance_due_date
                    ? `עד ${new Date(payments.balance_due_date).toLocaleDateString("he-IL")}`
                    : "ממתין"}
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
          💬 יש שאלה? שליחת הודעה ל{event.photographers.name} בוואטסאפ
        </a>
      )}
    </div>
  );
}
