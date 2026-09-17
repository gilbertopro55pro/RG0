"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PriceQuoteItem, PriceQuoteRow, PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";
import { openWhatsApp } from "@/lib/waLink";
import { formatDateDMY } from "@/lib/priceQuoteFormat";

const VAT_RATE = 0.18;

// Seeds the "פריט" dropdown with the items a photography business quotes most often — the input
// itself is a native <input list> so typing anything not in this list works exactly the same as
// picking one.
const ITEM_SUGGESTIONS = [
  "צילום חתונה",
  "צילום אירוסין",
  "צילום בר/בת מצווה",
  "צילום ברית/בריתה",
  "אלבום מעוצב",
  "הדפסות תמונות",
  "USB עם כל התמונות",
  "שעת צילום נוספת",
  "נסיעות",
  "עריכה דיגיטלית מתקדמת",
  "צילום וידאו",
  "מסירה דיגיטלית",
];

function emptyItem(): PriceQuoteItem {
  return { item: "", details: "", price: 0 };
}

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function computeTotals(items: PriceQuoteItem[]) {
  const subtotal = items.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  return { subtotal, vatAmount, total };
}

function currency(n: number): string {
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;
}

function sortQuotes(quotes: PriceQuoteRow[]): PriceQuoteRow[] {
  return [...quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Oldest-first, unlike the quotes list above — a curated preset list reads better in the order it
// was built rather than most-recently-touched-first.
function sortTemplates(templates: PriceQuoteTemplateRow[]): PriceQuoteTemplateRow[] {
  return [...templates].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// A template's "פריט" cell is the same supplier picker used for a vendor row in the quote builder
// (בונה הצעות מחיר) — picking a saved supplier (supplierId matches a real PricingSupplier.id) just
// fills the price in as a starting value; a free-text row (supplierId === "__custom__") carries its
// own name. Either way the price itself is a plain editable field on the row, not re-derived from
// the supplier list — a template can quote a different price than that supplier's current one. See
// resolveTemplateItems below for where a free-text row that isn't already a saved supplier gets
// added to the list on save.
type TemplateItemRow = { id: string; supplierId: string; customName: string; details: string; price: number };
type TemplateDraft = { name: string; items: TemplateItemRow[] };

function emptyTemplateItem(): TemplateItemRow {
  return { id: makeId(), supplierId: "", customName: "", details: "", price: 0 };
}

function emptyTemplateDraft(): TemplateDraft {
  return { name: "", items: [emptyTemplateItem()] };
}

function templateDraftFromRow(t: PriceQuoteTemplateRow, supplierList: PricingSupplier[]): TemplateDraft {
  return {
    name: t.name,
    items: t.items.length
      ? t.items.map((it) => {
          const matched = supplierList.find((s) => s.name === it.item);
          return matched
            ? { id: makeId(), supplierId: matched.id, customName: "", details: it.details, price: it.price }
            : { id: makeId(), supplierId: "__custom__", customName: it.item, details: it.details, price: it.price };
        })
      : [emptyTemplateItem()],
  };
}

function resolveTemplateItems(rows: TemplateItemRow[], supplierList: PricingSupplier[]): PriceQuoteItem[] {
  return rows
    .map((r) => {
      const name = r.supplierId === "__custom__" ? r.customName.trim() : supplierList.find((s) => s.id === r.supplierId)?.name ?? "";
      return name ? { item: name, details: r.details.trim(), price: Number(r.price) || 0 } : null;
    })
    .filter((it): it is PriceQuoteItem => it !== null);
}

type Draft = {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  workStartTime: string;
  workEndTime: string;
  items: PriceQuoteItem[];
};

const emptyDraft: Draft = {
  clientName: "",
  clientPhone: "",
  clientEmail: "",
  eventType: "",
  eventDate: "",
  eventLocation: "",
  workStartTime: "",
  workEndTime: "",
  items: [emptyItem()],
};

function draftFromQuote(q: PriceQuoteRow): Draft {
  return {
    clientName: q.client_name,
    clientPhone: q.client_phone ?? "",
    clientEmail: q.client_email ?? "",
    eventType: q.event_type ?? "",
    eventDate: q.event_date ?? "",
    eventLocation: q.event_location ?? "",
    workStartTime: q.work_start_time?.slice(0, 5) ?? "",
    workEndTime: q.work_end_time?.slice(0, 5) ?? "",
    items: q.items.length ? q.items : [emptyItem()],
  };
}

function workHoursSpan(start: string, end: string): string | undefined {
  if (!start || !end) return undefined;
  return `${start}-${end}`;
}

export default function PriceQuotesSettings({
  initialQuotes,
  initialTemplates,
  initialSuppliers,
  initialLogoPath,
  initialLogoUrl,
  initialBusinessId,
}: {
  initialQuotes: PriceQuoteRow[];
  initialTemplates: PriceQuoteTemplateRow[];
  initialSuppliers: PricingSupplier[];
  initialLogoPath: string | null;
  initialLogoUrl: string | null;
  initialBusinessId: string | null;
}) {
  const supabase = createClient();
  const [quotes, setQuotes] = useState(() => sortQuotes(initialQuotes));
  const [templates, setTemplates] = useState(() => sortTemplates(initialTemplates));
  // The same supplier list the quote builder's vendor rows draw from (photographers.pricing_
  // suppliers) — kept here too so the template item picker can offer it, and so a new free-text
  // item typed while building a template can be appended straight to it.
  const [supplierList, setSupplierList] = useState<PricingSupplier[]>(initialSuppliers);
  const [logoPath, setLogoPath] = useState(initialLogoPath);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(initialLogoUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [businessId, setBusinessId] = useState(initialBusinessId ?? "");
  const [savingBusinessId, setSavingBusinessId] = useState(false);

  // SettingsTabs keeps every tab mounted at once (display:none, never unmounted), so this
  // useState-from-props only ever runs its lazy initializer on the first mount — a change from a
  // different tab that triggers router.refresh() sends fresh props down here too, but without
  // this they'd sit unused until a hard reload. Same pattern as ClientMessagesSettings.
  useEffect(() => setQuotes(sortQuotes(initialQuotes)), [initialQuotes]);
  useEffect(() => setTemplates(sortTemplates(initialTemplates)), [initialTemplates]);
  useEffect(() => setSupplierList(initialSuppliers), [initialSuppliers]);
  useEffect(() => setLogoPath(initialLogoPath), [initialLogoPath]);
  useEffect(() => setLogoPreviewUrl(initialLogoUrl), [initialLogoUrl]);
  useEffect(() => setBusinessId(initialBusinessId ?? ""), [initialBusinessId]);

  const saveBusinessId = async () => {
    setSavingBusinessId(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("photographers").update({ business_id: businessId.trim() || null }).eq("id", user.id);
    setSavingBusinessId(false);
  };

  const [formOpen, setFormOpen] = useState<"new" | string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [sendOpenFor, setSendOpenFor] = useState<string | "draft" | null>(null);
  const [sendMethod, setSendMethod] = useState<"email" | "whatsapp">("whatsapp");
  const [sendRecipient, setSendRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [templateFormOpen, setTemplateFormOpen] = useState<"new" | string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(emptyTemplateDraft);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateFormError, setTemplateFormError] = useState<string | null>(null);
  const [confirmingDeleteTemplateId, setConfirmingDeleteTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  const startNewTemplate = () => {
    setTemplateFormOpen("new");
    setTemplateDraft(emptyTemplateDraft());
    setTemplateFormError(null);
  };

  const startEditTemplate = (t: PriceQuoteTemplateRow) => {
    setTemplateFormOpen(t.id);
    setTemplateDraft(templateDraftFromRow(t, supplierList));
    setTemplateFormError(null);
  };

  const cancelTemplateForm = () => {
    setTemplateFormOpen(null);
    setTemplateFormError(null);
  };

  const updateTemplateItem = (index: number, patch: Partial<TemplateItemRow>) => {
    setTemplateDraft((d) => ({ ...d, items: d.items.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  };
  const addTemplateItemRow = () => setTemplateDraft((d) => ({ ...d, items: [...d.items, emptyTemplateItem()] }));
  const removeTemplateItemRow = (index: number) =>
    setTemplateDraft((d) => ({ ...d, items: d.items.length > 1 ? d.items.filter((_, i) => i !== index) : d.items }));
  const selectTemplateItemSupplier = (index: number, value: string) => {
    if (value === "__custom__") {
      updateTemplateItem(index, { supplierId: value, customName: "" });
      return;
    }
    const matched = supplierList.find((s) => s.id === value);
    updateTemplateItem(index, { supplierId: value, customName: "", price: matched?.price ?? 0 });
  };

  const saveTemplate = async () => {
    setTemplateSaving(true);
    setTemplateFormError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setTemplateSaving(false);
      setTemplateFormError("יש להתחבר מחדש");
      return;
    }
    if (!templateDraft.name.trim()) {
      setTemplateSaving(false);
      setTemplateFormError("יש לתת שם לתבנית");
      return;
    }
    const items = resolveTemplateItems(templateDraft.items, supplierList);
    if (items.length === 0) {
      setTemplateSaving(false);
      setTemplateFormError("יש להוסיף לפחות פריט אחד");
      return;
    }

    // Any free-text row not already a saved supplier joins the list — so it shows up as a real
    // choice next time, here and in the quote builder's own vendor rows. Deduped case-insensitively
    // both against the existing list and against other new rows in this same save.
    const existingNames = new Set(supplierList.map((s) => s.name.trim().toLowerCase()));
    const newSuppliers: PricingSupplier[] = [];
    for (const r of templateDraft.items) {
      const name = r.customName.trim();
      if (r.supplierId !== "__custom__" || !name) continue;
      const key = name.toLowerCase();
      if (existingNames.has(key)) continue;
      existingNames.add(key);
      newSuppliers.push({ id: makeId(), name, price: Number(r.price) || 0 });
    }
    let nextSupplierList = supplierList;
    if (newSuppliers.length > 0) {
      nextSupplierList = [...supplierList, ...newSuppliers];
      await supabase.from("photographers").update({ pricing_suppliers: nextSupplierList }).eq("id", user.id);
      setSupplierList(nextSupplierList);
    }

    const row = { name: templateDraft.name.trim(), items };

    if (templateFormOpen && templateFormOpen !== "new") {
      const { data, error } = await supabase
        .from("price_quote_templates")
        .update(row)
        .eq("id", templateFormOpen)
        .select()
        .single<PriceQuoteTemplateRow>();
      setTemplateSaving(false);
      if (error || !data) {
        setTemplateFormError(error?.message ?? "שגיאה בשמירה");
        return;
      }
      setTemplates((prev) => sortTemplates(prev.map((t) => (t.id === data.id ? data : t))));
      setTemplateFormOpen(null);
      return;
    }

    const { data, error } = await supabase
      .from("price_quote_templates")
      .insert({ photographer_id: user.id, ...row })
      .select()
      .single<PriceQuoteTemplateRow>();
    setTemplateSaving(false);
    if (error || !data) {
      setTemplateFormError(error?.message ?? "שגיאה בשמירה");
      return;
    }
    setTemplates((prev) => sortTemplates([...prev, data]));
    setTemplateFormOpen(null);
  };

  const removeTemplate = async (id: string) => {
    setDeletingTemplateId(id);
    await supabase.from("price_quote_templates").delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setConfirmingDeleteTemplateId(null);
    setDeletingTemplateId(null);
    if (templateFormOpen === id) cancelTemplateForm();
  };

  const startNew = () => {
    setFormOpen("new");
    setDraft(emptyDraft);
    setFormError(null);
    setSendOpenFor(null);
  };

  const startEdit = (q: PriceQuoteRow) => {
    setFormOpen(q.id);
    setDraft(draftFromQuote(q));
    setFormError(null);
    setSendOpenFor(null);
  };

  const cancelForm = () => {
    setFormOpen(null);
    setFormError(null);
    setSendOpenFor(null);
  };

  const updateItem = (index: number, patch: Partial<PriceQuoteItem>) => {
    setDraft((d) => ({ ...d, items: d.items.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  };

  const addItemRow = () => setDraft((d) => ({ ...d, items: [...d.items, emptyItem()] }));
  const removeItemRow = (index: number) =>
    setDraft((d) => ({ ...d, items: d.items.length > 1 ? d.items.filter((_, i) => i !== index) : d.items }));

  const cleanItems = (items: PriceQuoteItem[]) => items.filter((r) => r.item.trim() || r.details.trim() || r.price);

  const preview = async () => {
    setPreviewing(true);
    setFormError(null);
    try {
      const items = cleanItems(draft.items);
      const { subtotal, vatAmount, total } = computeTotals(items);
      const res = await fetch("/api/price-quotes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: draft.clientName,
          items,
          subtotal,
          vatAmount,
          total,
          eventDetails: {
            type: draft.eventType.trim() || undefined,
            date: draft.eventDate ? formatDateDMY(draft.eventDate) : undefined,
            location: draft.eventLocation.trim() || undefined,
            workHours: workHoursSpan(draft.workStartTime, draft.workEndTime),
          },
        }),
      });
      if (!res.ok) throw new Error("יצירת התצוגה המקדימה נכשלה");
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "יצירת התצוגה המקדימה נכשלה");
    } finally {
      setPreviewing(false);
    }
  };

  const save = async (): Promise<PriceQuoteRow | null> => {
    setSaving(true);
    setFormError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setFormError("יש להתחבר מחדש");
      return null;
    }

    const items = cleanItems(draft.items);
    if (items.length === 0) {
      setSaving(false);
      setFormError("יש להוסיף לפחות פריט אחד");
      return null;
    }
    const { subtotal, vatAmount, total } = computeTotals(items);
    const row = {
      client_name: draft.clientName.trim(),
      client_phone: draft.clientPhone.trim() || null,
      client_email: draft.clientEmail.trim() || null,
      event_type: draft.eventType.trim() || null,
      event_date: draft.eventDate || null,
      event_location: draft.eventLocation.trim() || null,
      work_start_time: draft.workStartTime || null,
      work_end_time: draft.workEndTime || null,
      items,
      subtotal,
      vat_amount: vatAmount,
      total,
    };

    if (formOpen && formOpen !== "new") {
      const { data, error } = await supabase
        .from("price_quotes")
        .update(row)
        .eq("id", formOpen)
        .select()
        .single<PriceQuoteRow>();
      setSaving(false);
      if (error || !data) {
        setFormError(error?.message ?? "שגיאה בשמירה");
        return null;
      }
      setQuotes((prev) => sortQuotes(prev.map((q) => (q.id === data.id ? data : q))));
      return data;
    }

    const { data, error } = await supabase
      .from("price_quotes")
      .insert({ photographer_id: user.id, ...row })
      .select()
      .single<PriceQuoteRow>();
    setSaving(false);
    if (error || !data) {
      setFormError(error?.message ?? "שגיאה בשמירה");
      return null;
    }
    setQuotes((prev) => sortQuotes([...prev, data]));
    setFormOpen(data.id);
    return data;
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    await supabase.from("price_quotes").delete().eq("id", id);
    setQuotes((prev) => prev.filter((q) => q.id !== id));
    setConfirmingDeleteId(null);
    setDeletingId(null);
    if (formOpen === id) cancelForm();
  };

  const openSend = (target: string | "draft", existing?: PriceQuoteRow) => {
    setSendOpenFor(target);
    setSendError(null);
    setSendMethod("whatsapp");
    setSendRecipient(existing?.client_phone ?? draft.clientPhone ?? "");
  };

  const doSend = async () => {
    setSendError(null);
    if (sendMethod === "whatsapp" && !sendRecipient.trim()) {
      setSendError("יש להזין מספר טלפון");
      return;
    }
    if (sendMethod === "email" && !sendRecipient.trim()) {
      setSendError("יש להזין כתובת מייל");
      return;
    }
    setSending(true);
    // Sending from the open form (a still-unsaved draft or one being edited) saves first, so the
    // send route — which loads the quote by id — always has a real row to work from.
    let id = sendOpenFor;
    if (sendOpenFor === "draft") {
      const saved = await save();
      if (!saved) {
        setSending(false);
        return;
      }
      id = saved.id;
    }
    try {
      const res = await fetch(`/api/price-quotes/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sendMethod === "whatsapp" ? { method: "whatsapp", phone: sendRecipient.trim() } : { method: "email", email: sendRecipient.trim() }
        ),
      });
      const data: {
        quote?: PriceQuoteRow;
        whatsapp?: { clientPhone: string; message: string } | null;
        error?: string;
      } = await res.json();
      if (!res.ok || !data.quote) throw new Error(data.error ?? "השליחה נכשלה");
      setQuotes((prev) => sortQuotes(prev.map((q) => (q.id === data.quote!.id ? data.quote! : q))));
      if (data.whatsapp) {
        openWhatsApp(data.whatsapp.clientPhone, data.whatsapp.message);
      }
      setSendOpenFor(null);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "השליחה נכשלה");
    } finally {
      setSending(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploadingLogo(false);
      return;
    }
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/logo.${ext}`;
    try {
      const urlRes = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "logos", path, contentType: file.type || "image/png" }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok || !urlData.url) throw new Error(urlData.error ?? "העלאת הלוגו נכשלה");
      const putRes = await fetch(urlData.url, { method: "PUT", headers: { "Content-Type": file.type || "image/png" }, body: file });
      if (!putRes.ok) throw new Error("העלאת הלוגו נכשלה");
      await supabase.from("photographers").update({ logo_storage_path: path }).eq("id", user.id);
      setLogoPath(path);
      setLogoPreviewUrl(URL.createObjectURL(file));
    } catch {
      // Silent — the button simply stops spinning and the previous logo (if any) stays in place.
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("photographers").update({ logo_storage_path: null }).eq("id", user.id);
    setLogoPath(null);
    setLogoPreviewUrl(null);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold tracking-wide mb-1">הצעות מחיר</div>
      <p className="text-xs mb-3.5 text-ink-soft">
        בניית הצעת מחיר עצמאית ללקוח כלשהו — נשמרת ברשימה, ואפשר לשלוח אותה במייל או בוואטסאפ כקובץ PDF עם לוגו העסק.
      </p>

      <div className="rounded-xl p-3 bg-chip flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-lg bg-white border border-line shrink-0 flex items-center justify-center overflow-hidden">
          {logoPreviewUrl || logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreviewUrl ?? undefined} alt="לוגו" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px] text-ink-soft">אין לוגו</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold mb-1">לוגו העסק</div>
          <p className="text-[11px] text-ink-soft mb-1.5">יופיע בפינה הימנית העליונה של כל הצעת מחיר.</p>
          <div className="flex gap-2">
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-60"
            >
              {uploadingLogo ? "מעלה..." : logoPath ? "החלפת לוגו" : "העלאת לוגו"}
            </button>
            {logoPath && (
              <button onClick={removeLogo} className="text-xs text-rose">
                הסרה
              </button>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadLogo(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold mb-1 block">מספר ח.פ / עוסק</label>
        <div className="flex gap-2">
          <input
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="לדוגמה: 039119243"
            dir="ltr"
            className="flex-1 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white font-data text-left"
          />
          <button
            onClick={saveBusinessId}
            disabled={savingBusinessId}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-60"
          >
            {savingBusinessId ? "שומר..." : "שמירה"}
          </button>
        </div>
        <p className="text-[11px] text-ink-soft mt-1">יוצג בהצעת המחיר ליד שם העסק.</p>
      </div>

      <div className="mb-4">
        <div className="text-sm font-semibold tracking-wide mb-1">תבניות הצעות מחיר</div>
        <p className="text-xs mb-2.5 text-ink-soft">
          תבנית שמורה של פריטים קבועים (למשל &quot;חבילת חתונה בסיסית&quot;) — תופיע ברשימה נפתחת בבונה הצעות המחיר, ומהווה בסיס להצעה
          חדשה שאליה אפשר להוסיף שורות ספקים והערות.
        </p>

        {templates.length > 0 && (
          <div className="space-y-2 mb-2.5">
            {templates.map((t) =>
              confirmingDeleteTemplateId === t.id ? (
                <div key={t.id} className="rounded-xl p-3 bg-[#FBEEEC]">
                  <p className="text-xs mb-2.5 text-rose">למחוק את התבנית &quot;{t.name}&quot;?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => removeTemplate(t.id)}
                      disabled={deletingTemplateId === t.id}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                    >
                      {deletingTemplateId === t.id ? "מוחק..." : "כן, מחק"}
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteTemplateId(null)}
                      disabled={deletingTemplateId === t.id}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="rounded-xl p-3 bg-chip flex items-start justify-between gap-2">
                  <button onClick={() => startEditTemplate(t)} className="text-right flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{t.name}</div>
                    <div className="text-xs text-ink-soft font-data">
                      {t.items.length} פריטים · {currency(computeTotals(t.items).subtotal)}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => startEditTemplate(t)} className="text-xs text-ink-soft">
                      עריכה
                    </button>
                    <button onClick={() => setConfirmingDeleteTemplateId(t.id)} className="text-xs text-rose">
                      מחיקה
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {templateFormOpen ? (
          <div className="rounded-xl p-3 bg-chip space-y-2.5">
            <input
              value={templateDraft.name}
              onChange={(e) => setTemplateDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="שם התבנית (לדוגמה: חבילת חתונה בסיסית)"
              className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
            />

            <div className="space-y-1.5">
              {templateDraft.items.map((row, i) => (
                <div key={row.id} className="rounded-lg border border-line bg-white p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={row.supplierId}
                      onChange={(e) => selectTemplateItemSupplier(i, e.target.value)}
                      className="flex-1 min-w-0 text-xs bg-transparent outline-none"
                    >
                      <option value="" disabled>
                        בחירת פריט
                      </option>
                      {supplierList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value="__custom__">טקסט חופשי...</option>
                    </select>
                    {row.supplierId === "__custom__" && (
                      <input
                        value={row.customName}
                        onChange={(e) => updateTemplateItem(i, { customName: e.target.value })}
                        placeholder="שם הפריט"
                        className="flex-1 min-w-0 text-xs bg-transparent outline-none"
                      />
                    )}
                    {/* A saved supplier's own current price shown as the label itself once picked
                        (reference only — "here's what this normally costs") — a generic "מחיר"
                        label the rest of the time (nothing picked yet, or free text). Either way the
                        field beside it stays independently editable (see selectTemplateItemSupplier);
                        this label never locks the template to that supplier's price. */}
                    <span className="text-[11px] text-ink-soft shrink-0">
                      {row.supplierId && row.supplierId !== "__custom__"
                        ? currency(supplierList.find((s) => s.id === row.supplierId)?.price ?? 0)
                        : "מחיר"}
                    </span>
                    <input
                      value={row.price || ""}
                      onChange={(e) => updateTemplateItem(i, { price: Number(e.target.value) || 0 })}
                      type="number"
                      min={0}
                      placeholder="0"
                      className="w-16 shrink-0 text-xs font-data bg-transparent outline-none text-left"
                    />
                    <button
                      onClick={() => removeTemplateItemRow(i)}
                      disabled={templateDraft.items.length <= 1}
                      className="text-ink-soft text-xs shrink-0 disabled:opacity-30"
                      aria-label="הסרת פריט"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    value={row.details}
                    onChange={(e) => updateTemplateItem(i, { details: e.target.value })}
                    placeholder="פרטים (אופציונלי)"
                    className="w-full text-xs bg-transparent outline-none"
                  />
                </div>
              ))}
              <button onClick={addTemplateItemRow} className="text-xs text-ink-soft font-semibold">
                + הוספת פריט
              </button>
            </div>

            {templateFormError && <p className="text-xs text-rose">{templateFormError}</p>}

            <div className="flex gap-2">
              <button
                onClick={saveTemplate}
                disabled={templateSaving}
                className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60"
              >
                {templateSaving ? "שומר..." : "שמירה"}
              </button>
              <button onClick={cancelTemplateForm} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft">
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button onClick={startNewTemplate} className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
            + תבנית חדשה
          </button>
        )}
      </div>

      <div className="text-sm font-semibold tracking-wide mb-1">הצעות מחיר שמורות</div>

      {quotes.length > 0 && (
        <div className="space-y-2 mb-3">
          {quotes.map((q) =>
            confirmingDeleteId === q.id ? (
              <div key={q.id} className="rounded-xl p-3 bg-[#FBEEEC]">
                <p className="text-xs mb-2.5 text-rose">למחוק את הצעת המחיר עבור &quot;{q.client_name || "לקוח/ה"}&quot;?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => remove(q.id)}
                    disabled={deletingId === q.id}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                  >
                    {deletingId === q.id ? "מוחק..." : "כן, מחק"}
                  </button>
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    disabled={deletingId === q.id}
                    className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            ) : (
              <div key={q.id} className="rounded-xl p-3 bg-chip">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => startEdit(q)} className="text-right flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{q.quote_name || q.client_name || "לקוח/ה ללא שם"}</div>
                    <div className="text-xs text-ink-soft font-data">
                      {currency(q.total)} · {new Date(q.created_at).toLocaleDateString("he-IL")}
                      {q.sent_at && <span> · נשלח ב{q.sent_via === "whatsapp" ? "וואטסאפ" : "מייל"}</span>}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => startEdit(q)} className="text-xs text-ink-soft">
                      עריכה
                    </button>
                    <button onClick={() => setConfirmingDeleteId(q.id)} className="text-xs text-rose">
                      מחיקה
                    </button>
                  </div>
                </div>
                {sendOpenFor === q.id ? (
                  <SendPanel
                    method={sendMethod}
                    setMethod={setSendMethod}
                    recipient={sendRecipient}
                    setRecipient={setSendRecipient}
                    onSend={doSend}
                    onCancel={() => setSendOpenFor(null)}
                    sending={sending}
                    error={sendError}
                  />
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => openSend(q.id, q)}
                      className="flex-1 rounded-lg py-1.5 text-xs font-semibold bg-white border border-line text-ink"
                    >
                      שליחה
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {formOpen ? (
        <div className="rounded-xl p-3 bg-chip space-y-2.5">
          <input
            value={draft.clientName}
            onChange={(e) => setDraft((d) => ({ ...d, clientName: e.target.value }))}
            placeholder="שם הלקוח/ה"
            className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
          />
          <div className="flex gap-2">
            <input
              value={draft.clientPhone}
              onChange={(e) => setDraft((d) => ({ ...d, clientPhone: e.target.value }))}
              placeholder="050-0000000"
              dir="ltr"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white text-left font-data"
            />
            <input
              value={draft.clientEmail}
              onChange={(e) => setDraft((d) => ({ ...d, clientEmail: e.target.value }))}
              placeholder="מייל (אופציונלי)"
              dir="ltr"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white text-left"
            />
          </div>

          {/* Event context, shown on the PDF and in the WhatsApp send message — all optional,
              since a quote can also be for something that isn't really "an event" with a fixed
              date/hours. */}
          <div className="flex gap-2">
            <input
              value={draft.eventType}
              onChange={(e) => setDraft((d) => ({ ...d, eventType: e.target.value }))}
              placeholder="סוג האירוע"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
            />
            <input
              value={draft.eventDate}
              onChange={(e) => setDraft((d) => ({ ...d, eventDate: e.target.value }))}
              type="date"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
            />
          </div>
          <input
            value={draft.eventLocation}
            onChange={(e) => setDraft((d) => ({ ...d, eventLocation: e.target.value }))}
            placeholder="מיקום האירוע"
            className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-soft shrink-0">שעות עבודה</span>
            <input
              value={draft.workStartTime}
              onChange={(e) => setDraft((d) => ({ ...d, workStartTime: e.target.value }))}
              type="time"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
            />
            <span className="text-ink-soft">–</span>
            <input
              value={draft.workEndTime}
              onChange={(e) => setDraft((d) => ({ ...d, workEndTime: e.target.value }))}
              type="time"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
            />
          </div>

          <datalist id="price-quote-item-suggestions">
            {ITEM_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_1.3fr_74px_20px] gap-1.5 px-0.5">
              <span className="text-[10px] font-semibold text-ink-soft">פריט</span>
              <span className="text-[10px] font-semibold text-ink-soft">פרטים</span>
              <span className="text-[10px] font-semibold text-ink-soft">מחיר</span>
              <span />
            </div>
            {draft.items.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.3fr_74px_20px] gap-1.5 items-center">
                <input
                  value={row.item}
                  onChange={(e) => updateItem(i, { item: e.target.value })}
                  list="price-quote-item-suggestions"
                  placeholder="בחירה או הקלדה"
                  className="rounded-lg px-2 py-1.5 text-xs border border-line bg-white min-w-0"
                />
                <input
                  value={row.details}
                  onChange={(e) => updateItem(i, { details: e.target.value })}
                  placeholder="פרטים"
                  className="rounded-lg px-2 py-1.5 text-xs border border-line bg-white min-w-0"
                />
                <input
                  value={row.price || ""}
                  onChange={(e) => updateItem(i, { price: Number(e.target.value) || 0 })}
                  type="number"
                  min={0}
                  placeholder="0"
                  className="rounded-lg px-2 py-1.5 text-xs border border-line bg-white font-data min-w-0"
                />
                <button
                  onClick={() => removeItemRow(i)}
                  disabled={draft.items.length <= 1}
                  className="text-ink-soft text-sm disabled:opacity-30"
                  aria-label="הסרת פריט"
                >
                  ✕
                </button>
              </div>
            ))}
            <button onClick={addItemRow} className="text-xs text-ink-soft font-semibold">
              + הוספת פריט
            </button>
          </div>

          <CostSummary items={draft.items} />

          {formError && <p className="text-xs text-rose">{formError}</p>}

          <div className="flex gap-2">
            <button
              onClick={preview}
              disabled={previewing}
              className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink disabled:opacity-60"
            >
              {previewing ? "פותח..." : "תצוגה מקדימה"}
            </button>
            <button onClick={save} disabled={saving} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60">
              {saving ? "שומר..." : "שמירה"}
            </button>
            <button onClick={cancelForm} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft">
              ביטול
            </button>
          </div>

          {sendOpenFor === "draft" ? (
            <SendPanel
              method={sendMethod}
              setMethod={setSendMethod}
              recipient={sendRecipient}
              setRecipient={setSendRecipient}
              onSend={doSend}
              onCancel={() => setSendOpenFor(null)}
              sending={sending}
              error={sendError}
            />
          ) : (
            <button onClick={() => openSend("draft")} className="w-full rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink">
              שליחה ללקוח
            </button>
          )}
        </div>
      ) : (
        <button onClick={startNew} className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
          + הצעת מחיר חדשה
        </button>
      )}
    </div>
  );
}

function CostSummary({ items }: { items: PriceQuoteItem[] }) {
  const { subtotal, vatAmount, total } = computeTotals(items);
  return (
    <div className="max-w-[240px] rounded-lg border border-line bg-white p-2.5 space-y-1">
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>סה&quot;כ לא כולל מע&quot;מ</span>
        <span className="font-data">{currency(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>מע&quot;מ (18%)</span>
        <span className="font-data">{currency(vatAmount)}</span>
      </div>
      <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-line">
        <span>סה&quot;כ כולל מע&quot;מ</span>
        <span className="font-data text-amber-deep">{currency(total)}</span>
      </div>
    </div>
  );
}

function SendPanel({
  method,
  setMethod,
  recipient,
  setRecipient,
  onSend,
  onCancel,
  sending,
  error,
}: {
  method: "email" | "whatsapp";
  setMethod: (m: "email" | "whatsapp") => void;
  recipient: string;
  setRecipient: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  sending: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-2.5 mt-2 space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => setMethod("whatsapp")}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${method === "whatsapp" ? "bg-ink text-white" : "bg-chip text-ink-soft"}`}
        >
          וואטסאפ
        </button>
        <button
          onClick={() => setMethod("email")}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${method === "email" ? "bg-ink text-white" : "bg-chip text-ink-soft"}`}
        >
          מייל
        </button>
      </div>
      <input
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder={method === "whatsapp" ? "050-0000000" : "client@mail.com"}
        dir="ltr"
        className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-chip text-left font-data"
      />
      {error && <p className="text-xs text-rose">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onSend} disabled={sending} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60">
          {sending ? "שולח..." : "שליחה"}
        </button>
        <button onClick={onCancel} disabled={sending} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-chip text-ink-soft">
          ביטול
        </button>
      </div>
    </div>
  );
}
