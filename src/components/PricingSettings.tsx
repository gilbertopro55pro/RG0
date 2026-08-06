"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PACKAGE_LABELS, type PackageType } from "@/lib/stages";
import type { EventTypeRow, PackagePriceRow } from "@/lib/types";

export default function PricingSettings({
  initialEventTypes,
  initialPrices,
}: {
  initialEventTypes: EventTypeRow[];
  initialPrices: PackagePriceRow[];
}) {
  const [eventTypes, setEventTypes] = useState(initialEventTypes);
  const [prices, setPrices] = useState(initialPrices);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const supabase = createClient();

  const deleteEventType = async (id: string) => {
    setEventTypes((prev) => prev.filter((t) => t.id !== id));
    setPrices((prev) => prev.filter((p) => p.event_type_id !== id));
    setConfirmingDeleteId(null);
    await supabase.from("event_types").delete().eq("id", id);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold tracking-wide mb-1">מחירון לפי סוג אירוע</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        המחירים משמשים ליצירת הצעות מחיר אוטומטיות (כולל בוט ה-AI בוואטסאפ). השאירו שדה ריק כדי לסמן
        שהחבילה לא מוצעת לסוג האירוע הזה — הבוט יציע חלופה או יפנה ליצירת קשר ישיר איתכם.
      </p>

      {eventTypes.length === 0 && (
        <p className="text-xs text-ink-soft">
          עדיין אין סוגי אירוע — הם נוספים אוטומטית כשמוסיפים תמחור בעת יצירת חבילה מותאמת אישית.
        </p>
      )}

      <div className="space-y-3">
        {eventTypes.map((type) =>
          confirmingDeleteId === type.id ? (
            <div key={type.id} className="rounded-xl p-3 bg-[#FBEEEC]">
              <p className="text-xs mb-2.5 text-rose">
                למחוק את סוג האירוע &quot;{type.name}&quot;? כל המחירים ששמורים תחתיו (בכל החבילות) יימחקו.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => deleteEventType(type.id)}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white"
                >
                  כן, מחק
                </button>
                <button
                  onClick={() => setConfirmingDeleteId(null)}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <EventTypeCard
              key={type.id}
              eventType={type}
              prices={prices.filter((p) => p.event_type_id === type.id && p.package !== null)}
              onDelete={() => setConfirmingDeleteId(type.id)}
              onPricesSaved={(updated) =>
                setPrices((prev) => [...prev.filter((p) => p.event_type_id !== type.id), ...updated])
              }
            />
          )
        )}
      </div>
    </div>
  );
}

function EventTypeCard({
  eventType,
  prices,
  onDelete,
  onPricesSaved,
}: {
  eventType: EventTypeRow;
  prices: PackagePriceRow[];
  onDelete: () => void;
  onPricesSaved: (rows: PackagePriceRow[]) => void;
}) {
  const supabase = createClient();
  const priceByPackage = new Map(prices.map((p) => [p.package, p.price]));
  const [values, setValues] = useState<Record<PackageType, string>>(
    Object.fromEntries(
      Object.keys(PACKAGE_LABELS).map((p) => [p, priceByPackage.get(p as PackageType)?.toString() ?? ""])
    ) as Record<PackageType, string>
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const rows = (Object.keys(PACKAGE_LABELS) as PackageType[]).map((pkg) => ({
      photographer_id: user.id,
      event_type_id: eventType.id,
      package: pkg,
      price: values[pkg].trim() === "" ? null : Number(values[pkg]),
    }));
    const { data: saved } = await supabase
      .from("package_prices")
      .upsert(rows, { onConflict: "event_type_id,package" })
      .select();
    setSaving(false);
    setSaved(true);
    if (saved) onPricesSaved(saved as PackagePriceRow[]);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-xl p-3 bg-chip">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold">{eventType.name}</span>
        <button onClick={onDelete} className="text-xs text-rose">
          מחיקה
        </button>
      </div>
      <div className="space-y-2">
        {(Object.keys(PACKAGE_LABELS) as PackageType[]).map((pkg) => (
          <div key={pkg} className="flex items-center justify-between gap-3">
            <label className="text-xs text-ink-soft flex-1">{PACKAGE_LABELS[pkg]}</label>
            <input
              type="number"
              value={values[pkg]}
              onChange={(e) => setValues((prev) => ({ ...prev, [pkg]: e.target.value }))}
              placeholder="לא מוצע"
              className="w-24 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white font-data"
            />
          </div>
        ))}
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-lg py-2 text-xs font-semibold mt-2.5 bg-ink text-white disabled:opacity-60"
      >
        {saving ? "שומר..." : saved ? "נשמר ✓" : "שמירה"}
      </button>
    </div>
  );
}
