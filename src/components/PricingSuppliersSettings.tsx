"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PricingSupplier } from "@/lib/types";
import { IconClose } from "@/components/icons/AlbumIcons";

const DEFAULT_SUPPLIERS: Omit<PricingSupplier, "id">[] = [
  { name: "אלבום מעוצב", price: 0 },
  { name: "סט אלבומים", price: 0 },
  { name: "צלם שני", price: 0 },
  { name: "צלם וידאו", price: 0 },
  { name: "צוות מגנטים", price: 0 },
  { name: "עריכת וידאו", price: 0 },
];

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

export default function PricingSuppliersSettings({
  initialHourlyRate,
  initialSuppliers,
}: {
  initialHourlyRate: number;
  initialSuppliers: PricingSupplier[];
}) {
  const supabase = createClient();
  const [hourlyRate, setHourlyRate] = useState(initialHourlyRate);
  const [suppliers, setSuppliers] = useState<PricingSupplier[]>(
    initialSuppliers.length > 0 ? initialSuppliers : DEFAULT_SUPPLIERS.map((s) => ({ ...s, id: makeId() }))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateSupplier = (id: string, patch: Partial<PricingSupplier>) => {
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const removeSupplier = (id: string) => setSuppliers((prev) => prev.filter((s) => s.id !== id));
  const addSupplier = () => setSuppliers((prev) => [...prev, { id: makeId(), name: "", price: 0 }]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const cleanSuppliers = suppliers.filter((s) => s.name.trim());
    await supabase
      .from("photographers")
      .update({ hourly_shoot_rate: hourlyRate, pricing_suppliers: cleanSuppliers })
      .eq("id", user.id);
    setSuppliers(cleanSuppliers);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold tracking-wide mb-1">מחשבון אירועים — ספקים ותמחור</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        עלות הספקים ומחיר שעת הצילום שלך משמשים את מחשבון האירועים בדף הבית לחישוב מהיר של המחיר לדרוש מלקוח.
      </p>

      <div className="rounded-xl p-3 bg-chip mb-3">
        <div className="text-xs font-semibold mb-1.5">מחיר שעת צילום</div>
        <div className="flex items-center gap-2">
          <input
            value={hourlyRate || ""}
            onChange={(e) => setHourlyRate(Number(e.target.value) || 0)}
            type="number"
            min={0}
            placeholder="0"
            className="w-28 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white font-data"
          />
          <span className="text-xs text-ink-soft">₪ לשעה</span>
        </div>
      </div>

      <div className="text-xs font-semibold mb-1.5">ספקים</div>
      <div className="space-y-1.5 mb-2.5">
        {suppliers.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <input
              value={s.name}
              onChange={(e) => updateSupplier(s.id, { name: e.target.value })}
              placeholder="שם הספק"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-xs border border-line bg-white"
            />
            <input
              value={s.price || ""}
              onChange={(e) => updateSupplier(s.id, { price: Number(e.target.value) || 0 })}
              type="number"
              min={0}
              placeholder="0"
              className="w-20 rounded-lg px-2.5 py-1.5 text-xs border border-line bg-white font-data"
            />
            <button onClick={() => removeSupplier(s.id)} className="text-ink-soft text-sm px-1" aria-label="הסרת ספק">
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={addSupplier} className="text-xs text-ink-soft font-semibold mb-3">
        + הוספת ספק
      </button>

      <button onClick={save} disabled={saving} className="w-full rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60">
        {saving ? "שומר..." : saved ? "נשמר ✓" : "שמירה"}
      </button>
    </div>
  );
}
