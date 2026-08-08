"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CustomPackageRow, CustomPackageStageRow, EventTypeRow, PackagePriceRow } from "@/lib/types";
import { useModalEntered } from "@/lib/useModalEntered";

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
      <div className="text-sm font-semibold tracking-wide mb-1">חבילות מותאמות אישית</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        הגדירו חבילת אירוע משלכם — שם, עלות, ורשימת שלבי תהליך משלכם (במקום 5 החבילות הקבועות של
        המערכת). כל שלב שתסמנו ל&quot;שליחת הודעה ללקוח&quot; ישלח עדכון אוטומטי בוואטסאפ בסיום השלב.
      </p>

      {packages.length > 0 && (
        <div className="space-y-2 mb-3.5">
          {packages.map((pkg) =>
            confirmingDeleteId === pkg.id ? (
              <div key={pkg.id} className="rounded-xl p-3 bg-[#FBEEEC]">
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

function CustomPackageBuilder({
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
    const validStages = stages.filter((s) => s.name.trim());
    if (!trimmedName || validStages.length === 0) {
      setError("יש להזין שם לחבילה ולפחות שלב אחד עם שם");
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
        transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold font-display">{pkg ? "עריכת חבילה" : "חבילה מותאמת אישית חדשה"}</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            ✕
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
                    <input
                      value={stage.name}
                      onChange={(e) => updateStage(stage.clientId, { name: e.target.value })}
                      placeholder="שם השלב"
                      className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
                    />
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
                  <label className="flex items-center gap-2 text-xs cursor-pointer mb-1">
                    <input
                      type="checkbox"
                      checked={stage.notifyClient}
                      onChange={(e) => updateStage(stage.clientId, { notifyClient: e.target.checked })}
                    />
                    שליחת עדכון ללקוח/ה בסיום השלב
                  </label>
                  <p className="text-[11px] text-ink-soft mb-1.5">
                    {stage.notifyClient
                      ? "✓ מסומן: כשהשלב יסומן כבוצע, תישלח ללקוח/ה אוטומטית הודעת עדכון בוואטסאפ."
                      : "לא מסומן: זהו שלב פנימי בלבד (כמו עריכה או גיבוי) — לא תישלח שום הודעה ללקוח/ה."}
                  </p>
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
                <div className="text-center py-6 text-xs text-ink-soft">אין שלבים — הוסיפו שלב ראשון</div>
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
                  <div key={topic.clientId} className="rounded-xl p-2.5 bg-[#FBEEEC]">
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
                      className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white disabled:bg-[#F1EFE9]"
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
    </div>
  );
}
