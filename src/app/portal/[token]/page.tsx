import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { PACKAGE_FLOWS, STAGE_LABELS, STAGE_TYPE, currentStageIndex, packageLabel } from "@/lib/stages";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";
import type { CustomPackageStageRow, EventPaymentRow, EventRow, EventStageRow } from "@/lib/types";

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

  const [{ data: stages }, { data: payments }, { data: customStagesData }, { data: customPackageData }] =
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
    ]);

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
        <div className="space-y-1.5">
          {clientStages.map(({ key, label, stage, index }) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
              style={{ background: stage.done ? "var(--color-sage-bg)" : index === curIdx ? "var(--color-chip-tint)" : "var(--color-chip)" }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px]"
                style={{
                  background: stage.done ? "var(--color-sage)" : "#fff",
                  border: `1px solid ${stage.done ? "var(--color-sage)" : "var(--color-line)"}`,
                  color: stage.done ? "#fff" : "var(--color-ink-soft)",
                }}
              >
                {stage.done ? "✓" : ""}
              </span>
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </div>
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
