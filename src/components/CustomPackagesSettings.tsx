"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CustomPackageRow, CustomPackageStageRow, EventTypeRow, PackagePriceRow } from "@/lib/types";
import { useModalEntered } from "@/lib/useModalEntered";
import { IconClose } from "@/components/icons/AlbumIcons";
import {
  CUSTOMIZABLE_MESSAGE_STAGES,
  STAGE_LABELS,
  CLIENT_MESSAGE_INSERT_OPTIONS,
  CLIENT_MESSAGE_EMOJI_OPTIONS,
  PACKAGE_FLOWS,
} from "@/lib/stages";

// The stage-name suggestions dropdown offers every stage in the "חבילה מלאה" (full package) flow
// — not just the 5 CUSTOMIZABLE_MESSAGE_STAGES, which is a narrower list (only the stages with a
// centrally-editable message template). Keeping these as two separate lists is deliberate: picking
// a suggestion like "גיבוי חומר גולמי" here should still count as a "custom" stage name for the
// purposes of isCustomStageName below, since that stage has no central template to fall back on —
// only unlocking the per-stage message editor for names outside CUSTOMIZABLE_MESSAGE_STAGES is
// what makes that editor actually useful for a stage like that.
const ALL_STAGE_NAME_OPTIONS = PACKAGE_FLOWS.full;

// A stage name that matches one of the built-in customizable stages' own label already has its
// message customized centrally (Settings → הודעות ללקוח/ה, keyed by that stage's real StageKey)
// — only a genuinely custom-named stage needs its own per-stage template stored here.
const BUILTIN_STAGE_LABELS = new Set(CUSTOMIZABLE_MESSAGE_STAGES.map((k) => STAGE_LABELS[k]));
function isCustomStageName(name: string): boolean {
  return !BUILTIN_STAGE_LABELS.has(name.trim());
}

type StageDraft = {
  clientId: string;
  name: string;
  notifyClient: boolean;
  notifyText: string;
  requiresAlbumPdf: boolean;
};

const emptyStage = (): StageDraft => ({
  clientId: crypto.randomUUID(),
  name: "",
  notifyClient: false,
  notifyText: "",
  requiresAlbumPdf: false,
});

const MAX_STAGES = 25;

export default function CustomPackagesSettings({
  initialPackages,
  initialStages,
  initialEventTypes,
  initialPrices,
}: {
  initialPackages: CustomPackageRow[];
  initialStages: CustomPackageStageRow[];
  initialEventTypes: EventTypeRow[];
  initialPrices: PackagePriceRow[];
}) {
  const router = useRouter();
  const [packages, setPackages] = useState(initialPackages);
  const [stagesByPackage, setStagesByPackage] = useState(() => {
    const map = new Map<string, CustomPackageStageRow[]>();
    for (const s of initialStages) {
      map.set(s.package_id, [...(map.get(s.package_id) ?? []), s]);
    }
    return map;
  });
  const [eventTypes, setEventTypes] = useState(initialEventTypes);
  const [prices, setPrices] = useState(initialPrices);
  const [editing, setEditing] = useState<CustomPackageRow | "new" | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const supabase = createClient();

  // SettingsTabs keeps every tab mounted at once (display:none, never unmounted — see its own
  // comment) so this component's useState-from-props only ever runs its lazy initializer on the
  // very first mount. A change made from a DIFFERENT tab that triggers router.refresh() sends
  // fresh props down here too, but without this, they'd sit unused forever — the photographer
  // would see stale packages/pricing until a hard reload. Same pattern as ClientMessagesSettings.
  useEffect(() => setPackages(initialPackages), [initialPackages]);
  useEffect(() => {
    setStagesByPackage(() => {
      const map = new Map<string, CustomPackageStageRow[]>();
      for (const s of initialStages) {
        map.set(s.package_id, [...(map.get(s.package_id) ?? []), s]);
      }
      return map;
    });
  }, [initialStages]);
  useEffect(() => setEventTypes(initialEventTypes), [initialEventTypes]);
  useEffect(() => setPrices(initialPrices), [initialPrices]);

  const deletePackage = async (id: string) => {
    setDeletingId(id);
    await supabase.from("custom_packages").delete().eq("id", id);
    setPackages((prev) => prev.filter((p) => p.id !== id));
    setConfirmingDeleteId(null);
    setDeletingId(null);
    router.refresh();
  };

  const onSaved = (
    pkg: CustomPackageRow,
    stages: CustomPackageStageRow[],
    updatedEventTypes: EventTypeRow[],
    updatedPrices: PackagePriceRow[]
  ) => {
    setPackages((prev) => {
      const exists = prev.some((p) => p.id === pkg.id);
      return exists ? prev.map((p) => (p.id === pkg.id ? pkg : p)) : [...prev, pkg];
    });
    setStagesByPackage((prev) => new Map(prev).set(pkg.id, stages));
    setEventTypes(updatedEventTypes);
    setPrices(updatedPrices);
    setEditing(null);
    router.refresh();
  };

  const onEventTypeDeleted = (eventTypeId: string) => {
    setEventTypes((prev) => prev.filter((t) => t.id !== eventTypeId));
    setPrices((prev) => prev.filter((p) => p.event_type_id !== eventTypeId));
    router.refresh();
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold mb-1">חבילות מותאמות אישית</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        הגדירו חבילת אירוע משלכם, שם, עלות, ורשימת שלבי תהליך משלכם (במקום 5 החבילות הקבועות של
        המערכת). כל שלב שתסמנו ל&quot;שליחת הודעה ללקוח&quot; ישלח עדכון אוטומטי בוואטסאפ בסיום השלב.
      </p>

      {packages.length > 0 && (
        <div className="space-y-2 mb-3.5">
          {packages.map((pkg) =>
            confirmingDeleteId === pkg.id ? (
              <div key={pkg.id} className="rounded-xl p-3 bg-chip">
                <p className="text-xs mb-2.5 text-rose">
                  למחוק את החבילה &quot;{pkg.name}&quot;? אירועים קיימים שמשתמשים בה ימשיכו להציג את השלבים
                  שלהם, אבל לא יהיה ניתן ליצור איתה אירועים חדשים.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deletePackage(pkg.id)}
                    disabled={deletingId === pkg.id}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                  >
                    {deletingId === pkg.id ? "מוחק..." : "כן, מחק"}
                  </button>
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    disabled={deletingId === pkg.id}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={pkg.id}
                className="rounded-xl p-3 flex items-center justify-between gap-2 bg-chip"
              >
                <button onClick={() => setEditing(pkg)} className="text-right flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{pkg.name}</div>
                  <div className="text-xs text-ink-soft font-data">
                    {pkg.price != null ? `₪${pkg.price} · ` : ""}
                    {(stagesByPackage.get(pkg.id) ?? []).length} שלבים
                  </div>
                </button>
                <button onClick={() => setConfirmingDeleteId(pkg.id)} className="text-xs text-rose shrink-0">
                  מחיקה
                </button>
              </div>
            )
          )}
        </div>
      )}

      <button
        onClick={() => setEditing("new")}
        className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
      >
        + חבילה מותאמת אישית חדשה
      </button>

      {editing && (
        <CustomPackageBuilder
          pkg={editing === "new" ? null : editing}
          initialStages={editing === "new" ? [] : (stagesByPackage.get(editing.id) ?? [])}
          eventTypes={eventTypes}
          prices={prices}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onEventTypeDeleted={onEventTypeDeleted}
        />
      )}
    </div>
  );
}

type TopicDraft = {
  clientId: string; // real event_type id if already persisted, else a temp client-only id
  isPersisted: boolean;
  name: string;
  price: string;
};

export function CustomPackageBuilder({
  pkg,
  initialStages,
  eventTypes,
  prices,
  onClose,
  onSaved,
  onEventTypeDeleted,
}: {
  pkg: CustomPackageRow | null;
  initialStages: CustomPackageStageRow[];
  eventTypes: EventTypeRow[];
  prices: PackagePriceRow[];
  onClose: () => void;
  onSaved: (
    pkg: CustomPackageRow,
    stages: CustomPackageStageRow[],
    updatedEventTypes: EventTypeRow[],
    updatedPrices: PackagePriceRow[]
  ) => void;
  onEventTypeDeleted: (eventTypeId: string) => void;
}) {
  const supabase = createClient();
  const entered = useModalEntered();
  // Rendered via a portal straight to document.body (see the return statement below) instead of
  // inline where this component sits in the tree — nested many levels deep inside SettingsTabs'
  // display:none/block-toggled tab container. A fixed-position full-screen modal nested that deep
  // is exactly the shape of DOM structure known to make position:fixed unreliable on iOS Safari,
  // especially in this app's standalone (home-screen) mode — reports of the modal opening but
  // being completely unresponsive with no backdrop blur match that failure mode. Portaling to
  // document.body sidesteps it categorically. document.body only exists client-side, hence the
  // mounted gate (this component is only ever rendered in response to a client click anyway, so
  // it flips true essentially immediately).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [name, setName] = useState(pkg?.name ?? "");
  const [price, setPrice] = useState(pkg?.price?.toString() ?? "");
  const [topics, setTopics] = useState<TopicDraft[]>(() =>
    eventTypes.map((et) => ({
      clientId: et.id,
      isPersisted: true,
      name: et.name,
      price: prices.find((p) => p.event_type_id === et.id && p.custom_package_id === pkg?.id)?.price?.toString() ?? "",
    }))
  );
  const [confirmingRemoveTopicId, setConfirmingRemoveTopicId] = useState<string | null>(null);
  const [removingTopicId, setRemovingTopicId] = useState<string | null>(null);
  const [stages, setStages] = useState<StageDraft[]>(
    initialStages.length > 0
      ? initialStages.map((s) => ({
          clientId: s.id,
          name: s.name,
          notifyClient: s.notify_client,
          notifyText: s.notify_text ?? "",
          requiresAlbumPdf: s.requires_album_pdf,
        }))
      : [emptyStage()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // Per-custom-stage client-message template drafts, keyed by the stage's own clientId (which —
  // see rowFor's id field below — becomes that stage's real
  // custom_package_stages.id whether it's a brand-new draft or already persisted, so this same
  // key can be used to read AND write client_message_templates.stage_key = "custom:<clientId>"
  // both before and after the whole package is actually saved). Rendered inline in the stage row
  // itself (matching ClientMessagesSettings.tsx's own per-stage card) rather than in a popup, so
  // it's never reduced to a single-line control.
  const [stageMessageDrafts, setStageMessageDrafts] = useState<Record<string, string>>({});
  const [stageMessageSavingId, setStageMessageSavingId] = useState<string | null>(null);
  const [stageMessageSavedId, setStageMessageSavedId] = useState<string | null>(null);
  const [stageMessageErrorId, setStageMessageErrorId] = useState<string | null>(null);
  const [stageMessageEmptyErrorId, setStageMessageEmptyErrorId] = useState<string | null>(null);
  const [stageMessageAiLoadingId, setStageMessageAiLoadingId] = useState<string | null>(null);
  const [stageMessageAiErrorId, setStageMessageAiErrorId] = useState<string | null>(null);
  const [stageMessageEmojiOpenId, setStageMessageEmojiOpenId] = useState<string | null>(null);
  const stageTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  // Which stage's name-suggestions dropdown is open. A native <datalist> can't be styled (and
  // renders inconsistently — often not at all — on iOS Safari), so the 5 built-in stage names are
  // shown in a custom-rendered, scrollable panel instead, while the input itself stays a plain
  // free-text field.
  const [stageNameDropdownOpenId, setStageNameDropdownOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (initialStages.length === 0) return;
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const keys = initialStages.map((s) => `custom:${s.id}`);
      const { data } = await supabase
        .from("client_message_templates")
        .select("stage_key, body")
        .eq("photographer_id", user.id)
        .in("stage_key", keys)
        .returns<{ stage_key: string; body: string }[]>();
      if (cancelled || !data) return;
      setStageMessageDrafts((prev) => {
        const next = { ...prev };
        for (const row of data) next[row.stage_key.slice("custom:".length)] = row.body;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertStageToken = (clientId: string, token: string) => {
    const el = stageTextareaRefs.current[clientId];
    const current = stageMessageDrafts[clientId] ?? "";
    if (!el) {
      setStageMessageDrafts((prev) => ({ ...prev, [clientId]: current + token }));
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setStageMessageDrafts((prev) => ({ ...prev, [clientId]: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const askAiForStage = async (clientId: string, stageName: string) => {
    setStageMessageAiLoadingId(clientId);
    setStageMessageAiErrorId(null);
    try {
      const res = await fetch("/api/client-message-templates/ai-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageLabel: stageName, currentText: stageMessageDrafts[clientId] ?? "" }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error ?? "שגיאה");
      setStageMessageDrafts((prev) => ({ ...prev, [clientId]: data.text }));
    } catch {
      setStageMessageAiErrorId(clientId);
    } finally {
      setStageMessageAiLoadingId(null);
    }
  };

  const saveStageMessage = async (clientId: string) => {
    const body = (stageMessageDrafts[clientId] ?? "").trim();
    setStageMessageErrorId(null);
    setStageMessageEmptyErrorId(null);
    if (!body) {
      setStageMessageEmptyErrorId(clientId);
      return;
    }
    setStageMessageSavingId(clientId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStageMessageSavingId(null);
      setStageMessageErrorId(clientId);
      return;
    }
    const { error } = await supabase
      .from("client_message_templates")
      .upsert(
        { photographer_id: user.id, stage_key: `custom:${clientId}`, body, updated_at: new Date().toISOString() },
        { onConflict: "photographer_id,stage_key" }
      );
    setStageMessageSavingId(null);
    if (error) {
      setStageMessageErrorId(clientId);
      return;
    }
    setStageMessageDrafts((prev) => ({ ...prev, [clientId]: body }));
    setStageMessageSavedId(clientId);
    setTimeout(() => setStageMessageSavedId((cur) => (cur === clientId ? null : cur)), 2000);
  };

  const updateStage = (clientId: string, patch: Partial<StageDraft>) =>
    setStages((prev) => prev.map((s) => (s.clientId === clientId ? { ...s, ...patch } : s)));

  const moveStage = (index: number, dir: -1 | 1) => {
    setStages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleSelect = (clientId: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds((prev) => (prev.size === stages.length ? new Set() : new Set(stages.map((s) => s.clientId))));

  const removeSelected = () => {
    setStages((prev) => prev.filter((s) => !selectedIds.has(s.clientId)));
    setSelectedIds(new Set());
    setConfirmingRemove(false);
  };

  const addTopic = () =>
    setTopics((prev) => [...prev, { clientId: crypto.randomUUID(), isPersisted: false, name: "", price: "" }]);

  const updateTopic = (clientId: string, patch: Partial<TopicDraft>) =>
    setTopics((prev) => prev.map((t) => (t.clientId === clientId ? { ...t, ...patch } : t)));

  // Deleting a topic removes the underlying event_type globally — it's shared pricing data used
  // by every package (built-in and custom alike), not just this one — so it happens immediately
  // on confirm rather than waiting for "שמירת החבילה" like stages do.
  const removeTopic = async (topic: TopicDraft) => {
    if (topic.isPersisted) {
      setRemovingTopicId(topic.clientId);
      await supabase.from("event_types").delete().eq("id", topic.clientId);
      setRemovingTopicId(null);
      onEventTypeDeleted(topic.clientId);
    }
    setTopics((prev) => prev.filter((t) => t.clientId !== topic.clientId));
    setConfirmingRemoveTopicId(null);
  };

  const save = async () => {
    const trimmedName = name.trim();
    // Stages are optional — a package can be saved with just a name and no process steps at all,
    // and stages added later by reopening and editing it. See createEvent.ts's own comment on why
    // creating an EVENT from a stage-less package is still fully supported (an empty event_stages
    // list, not a blocked state).
    const validStages = stages.filter((s) => s.name.trim());
    if (!trimmedName) {
      setError("יש להזין שם לחבילה");
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setError("יש להתחבר מחדש");
      return;
    }

    const { data: savedPkg, error: pkgError } = pkg
      ? await supabase
          .from("custom_packages")
          .update({ name: trimmedName, price: price.trim() === "" ? null : Number(price) })
          .eq("id", pkg.id)
          .select()
          .single<CustomPackageRow>()
      : await supabase
          .from("custom_packages")
          .insert({
            photographer_id: user.id,
            name: trimmedName,
            price: price.trim() === "" ? null : Number(price),
          })
          .select()
          .single<CustomPackageRow>();

    if (pkgError || !savedPkg) {
      setSaving(false);
      setError(pkgError?.message ?? "שגיאה בשמירת החבילה");
      return;
    }

    // Existing stages are updated in place (never delete-and-reinsert) — a stage's id may
    // already be referenced by in-progress events' event_stages rows via custom_stage_id, and
    // that FK cascades on delete, which would silently wipe those events' tracked progress.
    const originalIds = new Set(initialStages.map((s) => s.id));
    const currentIds = new Set(validStages.filter((s) => originalIds.has(s.clientId)).map((s) => s.clientId));
    const removedIds = [...originalIds].filter((id) => !currentIds.has(id));

    const rowFor = (s: StageDraft, i: number) => ({
      // Explicit, not the column's own default — lets a brand-new stage's id be known client-side
      // before this save even runs (see stageMessageTemplates above), since it's already the same
      // random uuid used as this draft's React key from the moment "+ שלב" was clicked.
      id: s.clientId,
      package_id: savedPkg.id,
      photographer_id: user.id,
      name: s.name.trim(),
      sort_order: i,
      notify_client: s.notifyClient || s.requiresAlbumPdf,
      notify_text: s.notifyClient && s.notifyText.trim() ? s.notifyText.trim() : null,
      requires_album_pdf: s.requiresAlbumPdf,
    });

    if (removedIds.length > 0) {
      await supabase.from("custom_package_stages").delete().in("id", removedIds);
    }

    const updates = validStages
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => originalIds.has(s.clientId));
    const inserts = validStages
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !originalIds.has(s.clientId));

    const results: CustomPackageStageRow[] = [];
    let stagesError: string | null = null;

    for (const { s, i } of updates) {
      const { data, error } = await supabase
        .from("custom_package_stages")
        .update(rowFor(s, i))
        .eq("id", s.clientId)
        .select()
        .single<CustomPackageStageRow>();
      if (error || !data) stagesError = error?.message ?? "שגיאה בעדכון שלב";
      else results.push(data);
    }

    if (inserts.length > 0) {
      const { data, error } = await supabase
        .from("custom_package_stages")
        .insert(inserts.map(({ s, i }) => rowFor(s, i)))
        .select()
        .returns<CustomPackageStageRow[]>();
      if (error || !data) stagesError = error?.message ?? "שגיאה בהוספת שלבים";
      else results.push(...data);
    }

    if (stagesError) {
      setSaving(false);
      setError(stagesError);
      return;
    }

    // Topics (event types) are shared across every package — new ones get created here, then
    // this package's price under each is upserted. Blank price = "not offered", matching the
    // built-in pricing table's convention, rather than removing the row.
    const updatedEventTypes = [...eventTypes];
    const updatedPrices = prices.filter((p) => p.custom_package_id !== savedPkg.id);
    let topicsError: string | null = null;

    for (const t of topics) {
      if (!t.name.trim()) continue;
      let eventTypeId = t.clientId;
      if (!t.isPersisted) {
        const { data: createdType, error: etError } = await supabase
          .from("event_types")
          .insert({ photographer_id: user.id, name: t.name.trim(), sort_order: updatedEventTypes.length })
          .select()
          .single<EventTypeRow>();
        if (etError || !createdType) {
          topicsError = etError?.message ?? "שגיאה בהוספת נושא";
          continue;
        }
        eventTypeId = createdType.id;
        updatedEventTypes.push(createdType);
      }
      const { data: priceRow, error: priceError } = await supabase
        .from("package_prices")
        .upsert(
          {
            photographer_id: user.id,
            event_type_id: eventTypeId,
            custom_package_id: savedPkg.id,
            price: t.price.trim() === "" ? null : Number(t.price),
          },
          { onConflict: "event_type_id,custom_package_id" }
        )
        .select()
        .single<PackagePriceRow>();
      if (priceError || !priceRow) topicsError = priceError?.message ?? "שגיאה בשמירת תמחור";
      else updatedPrices.push(priceRow);
    }

    setSaving(false);
    if (topicsError) {
      setError(topicsError);
      return;
    }

    onSaved(savedPkg, results.sort((a, b) => a.sort_order - b.sort_order), updatedEventTypes, updatedPrices);
  };

  // A centered, ~85vh-tall modal well above the sticky top nav bar's own z-30 (see TopNav.tsx) —
  // not anchored to the viewport bottom, so its own top edge can never land underneath the nav bar
  // on a short/mobile viewport.
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 flex justify-center z-[100] items-center p-4"
      style={{
        background: "rgba(28, 27, 25, 0.45)",
        backdropFilter: entered ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
        transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-5 pb-8 bg-paper shadow-sheet overflow-y-auto"
        style={{ height: "85vh" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold font-display">{pkg ? "עריכת חבילה" : "חבילה מותאמת אישית חדשה"}</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם החבילה</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: צילומי חוץ בלבד"
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">עלות (₪, אופציונלי)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>

          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-ink-soft">שלבי התהליך (לפי סדר)</label>
              <span className="text-[11px] text-ink-soft font-data">{stages.length}/{MAX_STAGES}</span>
            </div>

            {stages.length > 0 && (
              <div className="flex items-center justify-between mb-2 px-1">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer text-ink-soft">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === stages.length}
                    onChange={toggleSelectAll}
                  />
                  בחירת הכל
                </label>
                {selectedIds.size > 0 &&
                  (confirmingRemove ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-rose">למחוק {selectedIds.size} שלבים?</span>
                      <button onClick={removeSelected} className="text-xs font-semibold text-rose">
                        כן, מחק
                      </button>
                      <button onClick={() => setConfirmingRemove(false)} className="text-xs text-ink-soft">
                        ביטול
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmingRemove(true)} className="text-xs font-semibold text-rose">
                      מחיקת {selectedIds.size} שלבים שנבחרו
                    </button>
                  ))}
              </div>
            )}

            <div className="space-y-2">
              {stages.map((stage, i) => (
                <div key={stage.clientId} className="rounded-xl p-3 bg-chip">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={selectedIds.has(stage.clientId)}
                      onChange={() => toggleSelect(stage.clientId)}
                      aria-label="בחירת שלב למחיקה"
                    />
                    <span className="text-xs shrink-0 w-5 text-center text-ink-soft font-data">{i + 1}</span>
                    <div className="relative flex-1 min-w-0">
                      <input
                        value={stage.name}
                        onChange={(e) => updateStage(stage.clientId, { name: e.target.value })}
                        onFocus={() => setStageNameDropdownOpenId(stage.clientId)}
                        onBlur={() =>
                          setTimeout(
                            () => setStageNameDropdownOpenId((cur) => (cur === stage.clientId ? null : cur)),
                            120
                          )
                        }
                        placeholder="שם השלב"
                        className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
                      />
                      {stageNameDropdownOpenId === stage.clientId && (
                        <div className="absolute z-20 top-full right-0 left-0 mt-1 rounded-lg border border-line bg-white shadow-sheet max-h-[184px] overflow-y-auto">
                          {ALL_STAGE_NAME_OPTIONS.map((k) => (
                            <button
                              key={k}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                updateStage(stage.clientId, { name: STAGE_LABELS[k] });
                                setStageNameDropdownOpenId(null);
                              }}
                              className="block w-full text-right px-3 py-2 text-sm hover:bg-chip"
                            >
                              {STAGE_LABELS[k]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col shrink-0">
                      <button
                        onClick={() => moveStage(i, -1)}
                        disabled={i === 0}
                        className="text-xs px-1 text-ink-soft disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveStage(i, 1)}
                        disabled={i === stages.length - 1}
                        className="text-xs px-1 text-ink-soft disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                  <div className="mb-1.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold">
                          {stage.notifyClient ? "שלב מול הלקוח/ה" : "שלב פנימי"}
                        </span>
                        <button
                          onClick={() => updateStage(stage.clientId, { notifyClient: !stage.notifyClient })}
                          role="switch"
                          aria-checked={stage.notifyClient}
                          className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
                          style={{
                            background: stage.notifyClient ? "var(--color-amber-deep)" : "var(--color-line)",
                            justifyContent: stage.notifyClient ? "flex-start" : "flex-end",
                          }}
                        >
                          <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
                        </button>
                      </div>
                      <p className="text-[11px] text-ink-soft">
                        {stage.notifyClient
                          ? "שלב מול הלקוח/ה: כשמסמנים אותו כבוצע, נשלחת ללקוח/ה אוטומטית הודעת עדכון בוואטסאפ."
                          : "שלב פנימי: רק אתם רואים ומסמנים אותו (כמו עריכה או גיבוי). הלקוח/ה לא מקבלים עליו שום הודעה."}
                      </p>
                      {stage.notifyClient && isCustomStageName(stage.name) && (
                        <div className="mt-2 rounded-xl p-3 bg-white border border-line">
                          <div className="text-xs font-semibold mb-2">תבנית ההודעה שתישלח ללקוח/ה בסיום השלב</div>
                          <textarea
                            ref={(el) => {
                              stageTextareaRefs.current[stage.clientId] = el;
                            }}
                            value={stageMessageDrafts[stage.clientId] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setStageMessageDrafts((prev) => ({ ...prev, [stage.clientId]: value }));
                              setStageMessageEmptyErrorId((cur) => (cur === stage.clientId ? null : cur));
                            }}
                            rows={4}
                            placeholder={`לדוגמה: שלום {{שם}}, השלב "${stage.name || "..."}" הושלם! קישור: `}
                            className="w-full rounded-lg px-2.5 py-2 text-sm border border-line bg-white leading-relaxed"
                          />
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <select
                              value=""
                              onChange={(e) => {
                                const token = e.target.value;
                                if (!token) return;
                                const opt = CLIENT_MESSAGE_INSERT_OPTIONS.find((o) => o.token === token);
                                if (opt) insertStageToken(stage.clientId, opt.insertText);
                              }}
                              className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white border border-line text-ink-soft"
                            >
                              <option value="" disabled>
                                + הוספת פרט
                              </option>
                              {CLIENT_MESSAGE_INSERT_OPTIONS.map((opt) => (
                                <option key={opt.token} value={opt.token}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setStageMessageEmojiOpenId((cur) => (cur === stage.clientId ? null : stage.clientId))}
                              className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white border border-line text-ink-soft"
                            >
                              😀 אימוג׳י
                            </button>
                            <button
                              type="button"
                              onClick={() => askAiForStage(stage.clientId, stage.name)}
                              disabled={stageMessageAiLoadingId === stage.clientId}
                              className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-bg text-amber-deep disabled:opacity-60"
                            >
                              {stageMessageAiLoadingId === stage.clientId ? "מנסח..." : "עזרה בניסוח"}
                            </button>
                          </div>
                          {stageMessageEmojiOpenId === stage.clientId && (
                            <div className="mt-2 rounded-xl p-2.5 bg-chip border border-line grid grid-cols-8 gap-1">
                              {CLIENT_MESSAGE_EMOJI_OPTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    insertStageToken(stage.clientId, emoji);
                                    setStageMessageEmojiOpenId(null);
                                  }}
                                  className="text-lg rounded-lg py-1 hover:bg-chip"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                          {stageMessageAiErrorId === stage.clientId && (
                            <p className="text-xs text-rose mt-1.5">שגיאה בפנייה ל-AI, נסו שוב</p>
                          )}
                          {stageMessageEmptyErrorId === stage.clientId && (
                            <p className="text-xs text-rose mt-1.5">ההודעה ריקה. יש להזין טקסט לפני שמירה</p>
                          )}
                          {stageMessageErrorId === stage.clientId && <p className="text-xs text-rose mt-1.5">שגיאה בשמירה, נסו שוב</p>}
                          <div className="flex justify-end mt-2">
                            <button
                              onClick={() => saveStageMessage(stage.clientId)}
                              disabled={stageMessageSavingId === stage.clientId}
                              className="rounded-lg px-4 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-60"
                            >
                              {stageMessageSavingId === stage.clientId
                                ? "שומר..."
                                : stageMessageSavedId === stage.clientId
                                  ? "נשמר ✓"
                                  : "שמירת התבנית"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  {stage.notifyClient && (
                    <input
                      value={stage.notifyText}
                      onChange={(e) => updateStage(stage.clientId, { notifyText: e.target.value })}
                      placeholder="טקסט חופשי ליומן ההתראות (אופציונלי)"
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs border border-line bg-white mb-1.5"
                    />
                  )}
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stage.requiresAlbumPdf}
                      onChange={(e) => updateStage(stage.clientId, { requiresAlbumPdf: e.target.checked })}
                    />
                    שלב זה כולל העלאת קובץ PDF (עיצוב אלבום) שיישלח ללקוח/ה
                  </label>
                </div>
              ))}
              {stages.length === 0 && (
                <div className="text-center py-6 text-xs text-ink-soft">אין שלבים. הוסיפו שלב ראשון</div>
              )}
            </div>
            <button
              onClick={() => setStages((prev) => [...prev, emptyStage()])}
              disabled={stages.length >= MAX_STAGES}
              className="w-full rounded-lg py-2 text-xs font-semibold mt-2 bg-white border border-line text-ink disabled:opacity-40"
            >
              + הוספת שלב
            </button>
          </div>

          <div className="pt-1">
            <label className="text-xs block mb-1.5 text-ink-soft">תמחור לפי סוג אירוע (נושא)</label>
            <p className="text-[11px] text-ink-soft mb-2">
              השאירו מחיר ריק אם החבילה לא מוצעת לנושא הזה. נושאים משותפים לכל החבילות, כולל
              המחירון הרגיל בהגדרות.
            </p>
            <div className="space-y-2">
              {topics.map((topic) =>
                confirmingRemoveTopicId === topic.clientId ? (
                  <div key={topic.clientId} className="rounded-xl p-2.5 bg-chip">
                    <p className="text-[11px] mb-2 text-rose">
                      למחוק את הנושא &quot;{topic.name}&quot;? המחיר שלו יימחק מכל החבילות, כולל המחירון הרגיל.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => removeTopic(topic)}
                        disabled={removingTopicId === topic.clientId}
                        className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold bg-rose text-white disabled:opacity-60"
                      >
                        {removingTopicId === topic.clientId ? "מוחק..." : "כן, מחק"}
                      </button>
                      <button
                        onClick={() => setConfirmingRemoveTopicId(null)}
                        className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold bg-white border border-line text-ink-soft"
                      >
                        ביטול
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={topic.clientId} className="flex items-center gap-2">
                    <input
                      value={topic.name}
                      onChange={(e) => updateTopic(topic.clientId, { name: e.target.value })}
                      placeholder="שם הנושא"
                      disabled={topic.isPersisted}
                      className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white disabled:bg-chip"
                    />
                    <input
                      type="number"
                      value={topic.price}
                      onChange={(e) => updateTopic(topic.clientId, { price: e.target.value })}
                      placeholder="₪"
                      className="w-20 shrink-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white font-data"
                    />
                    <button
                      onClick={() => setConfirmingRemoveTopicId(topic.clientId)}
                      className="text-xs text-rose shrink-0"
                    >
                      מחיקה
                    </button>
                  </div>
                )
              )}
              {topics.length === 0 && (
                <div className="text-center py-4 text-xs text-ink-soft">אין נושאים עדיין</div>
              )}
            </div>
            <button
              onClick={addTopic}
              className="w-full rounded-lg py-2 text-xs font-semibold mt-2 bg-white border border-line text-ink"
            >
              + הוספת נושא
            </button>
          </div>

          {error && <p className="text-xs text-rose">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60"
          >
            {saving ? "שומר..." : "שמירת החבילה"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
