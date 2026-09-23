"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PortfolioUploadPanel from "@/components/PortfolioUploadPanel";
import PortfolioManagePanel from "@/components/PortfolioManagePanel";
import PortfolioFeaturedPicker from "@/components/PortfolioFeaturedPicker";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import type { Photographer } from "@/lib/types";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;
// Must match NO_CATEGORY_TAB in src/app/p/[slug]/page.tsx — the sentinel a curated share link uses
// for "uncategorized photos", since the `tabs` query param can't carry an actual null.
const NO_CATEGORY_TAB = "__none__";
type ShareTab = { key: string; label: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export default function PortfolioSettings({ photographer }: { photographer: Photographer }) {
  const supabase = createClient();
  // Entry-tier ("פרו סטארט") photographers don't get the public portfolio page — real
  // enforcement lives server-side too, in the /p/[slug] route itself (loadPortfolio checks the
  // photographer's tier before ever returning data), so this toggle being merely disabled here is
  // a UX courtesy, not the only thing standing between an entry-tier account and a live page.
  const portfolioAllowed = SUBSCRIPTION_PLANS[photographer.plan].tier !== "basic";
  const [enabled, setEnabled] = useState(photographer.portfolio_enabled);
  const [slug, setSlug] = useState(photographer.portfolio_slug ?? "");
  const [bio, setBio] = useState(photographer.portfolio_bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Tracks the last actually-PERSISTED slug (vs. `slug`, which also reflects an unsaved edit in
  // progress) — the copy-link/share buttons must never hand out a URL that 404s because the save
  // button hasn't been pressed yet.
  const [persistedSlug, setPersistedSlug] = useState(photographer.portfolio_slug ?? "");
  const [persistedEnabled, setPersistedEnabled] = useState(photographer.portfolio_enabled);

  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareView, setShareView] = useState<"main" | "qr">("main");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Which tabs a curated share link should expose — loaded fresh each time the sheet opens (cheap
  // query, and keeps it in sync with photos tagged/removed since the sheet was last opened).
  // `selectedTabs` starts as "every tab" so the default behavior (nothing unchecked) is exactly
  // today's "share everything" link — the `tabs` param is only ever added when the photographer
  // actually narrows it.
  const [availableTabs, setAvailableTabs] = useState<ShareTab[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!shareOpen) return;
    (async () => {
      const { data } = await supabase
        .from("gallery_photos")
        .select("portfolio_category")
        .eq("photographer_id", photographer.id)
        .eq("in_portfolio", true);
      const keys = new Set((data ?? []).map((r) => r.portfolio_category ?? NO_CATEGORY_TAB));
      const tabs: ShareTab[] = Array.from(keys)
        .filter((k) => k !== NO_CATEGORY_TAB)
        .sort((a, b) => a.localeCompare(b, "he"))
        .map((k) => ({ key: k, label: k }));
      if (keys.has(NO_CATEGORY_TAB)) tabs.push({ key: NO_CATEGORY_TAB, label: "כללי (ללא נושא)" });
      setAvailableTabs(tabs);
      setSelectedTabs(new Set(tabs.map((t) => t.key)));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [shareOpen, photographer.id]);

  const toggleTab = (key: string) => {
    setSelectedTabs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Only appends `?tabs=...` when the photographer actually narrowed the selection — leaving
  // everything checked (or there being 0-1 tabs to begin with) hands out the plain, full link.
  const buildShareUrl = (base: string) => {
    if (availableTabs.length < 2 || selectedTabs.size === availableTabs.length) return base;
    const chosen = availableTabs.filter((t) => selectedTabs.has(t.key)).map((t) => encodeURIComponent(t.key));
    return `${base}?tabs=${chosen.join(",")}`;
  };

  const save = async () => {
    setError(null);
    const effectiveEnabled = enabled && portfolioAllowed;
    const cleanSlug = slugify(slug);
    if (effectiveEnabled && !SLUG_PATTERN.test(cleanSlug)) {
      setError("כתובת לא תקינה. רק אותיות אנגלית קטנות, מספרים ומקפים, לפחות 2 תווים");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase
      .from("photographers")
      .update({
        portfolio_enabled: effectiveEnabled,
        portfolio_slug: cleanSlug || null,
        portfolio_bio: bio.trim() || null,
      })
      .eq("id", photographer.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.code === "23505" ? "הכתובת הזו כבר תפוסה. נסו כתובת אחרת" : "שגיאה בשמירה");
      return;
    }
    setSlug(cleanSlug);
    setPersistedSlug(cleanSlug);
    setPersistedEnabled(effectiveEnabled);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const previewUrl = slug ? `/p/${slugify(slug)}` : null;
  const liveUrl = persistedEnabled && persistedSlug ? `${typeof window !== "undefined" ? window.location.origin : "https://myframeflow.com"}/p/${persistedSlug}` : null;

  const copyLiveLink = async () => {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing more we can do here
    }
  };

  const shareMessage = (url: string) =>
    `היי, אשמח שתעיפו מבט בתיק העבודות שלי 📸\n${url}${photographer.name ? `\n\n${photographer.name} - צילום אירועים` : ""}`;

  const shareViaWhatsapp = () => {
    if (!liveUrl) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage(buildShareUrl(liveUrl)))}`, "_blank");
    setShareOpen(false);
  };

  const shareViaQr = async () => {
    if (!liveUrl) return;
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(buildShareUrl(liveUrl), { width: 280, margin: 1 });
    setQrDataUrl(dataUrl);
    setShareView("qr");
  };

  const shareViaOther = async () => {
    if (!liveUrl) return;
    const url = buildShareUrl(liveUrl);
    const text = shareMessage(url);
    if (navigator.share) {
      try {
        await navigator.share({ title: "תיק עבודות", text, url });
      } catch {
        // user canceled the native share sheet
      }
    } else {
      await navigator.clipboard.writeText(text);
      setShareStatus("הקישור הועתק ✓");
      setTimeout(() => setShareStatus(null), 2000);
    }
    setShareOpen(false);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold">פורטפוליו ציבורי</span>
        <button
          onClick={() => portfolioAllowed && setEnabled((v) => !v)}
          role="switch"
          aria-checked={enabled}
          aria-label="פורטפוליו ציבורי"
          disabled={!portfolioAllowed}
          className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5 disabled:opacity-50"
          style={{
            background: enabled ? "var(--color-amber-deep)" : "var(--color-line)",
            justifyContent: enabled ? "flex-start" : "flex-end",
          }}
        >
          <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
        </button>
      </div>
      {!portfolioAllowed ? (
        <p className="text-xs mb-3.5 text-ink-soft">
          זמין ממסלול פרו ומעלה, שדרגו מסלול בהגדרות כדי לפתוח עמוד תיק עבודות ציבורי.
        </p>
      ) : (
        <p className="text-xs mb-3.5 text-ink-soft">
          עמוד ציבורי עם תמונות שתבחרו מהגלריות שלכם. אפשר לשתף כתיק עבודות ללקוחות פוטנציאליים. סימון תמונה
          &quot;לתיק עבודות&quot; נעשה מתוך ניהול הגלריה עצמה, בתפריט הפעולות של כל תמונה.
        </p>
      )}

      {enabled && portfolioAllowed && (
        <>
          <label className="text-xs block mb-1 text-ink-soft">כתובת הפורטפוליו</label>
          <div className="flex items-center gap-1 mb-3">
            <span className="text-xs text-ink-soft font-mono shrink-0">myframeflow.com/p/</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="roi-gilberto"
              dir="ltr"
              className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-sm border border-line bg-white font-mono"
            />
          </div>

          <label className="text-xs block mb-1 text-ink-soft">טקסט פתיחה (אופציונלי)</label>
          <p className="text-[11px] text-ink-soft mb-1.5 leading-relaxed">
            זה המקום להציג את עצמך ללקוחות: כמה מילים עליך, על הסטודיו והסגנון שלך. הטקסט יופיע באיזור ההיכרות בראש
            עמוד הפורטפוליו הציבורי.
          </p>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="כמה מילים עליכם ועל הסטודיו"
            className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3 resize-none"
          />
          <PortfolioUploadPanel photographerId={photographer.id} />
          <PortfolioFeaturedPicker photographerId={photographer.id} />
          <PortfolioManagePanel photographerId={photographer.id} />
        </>
      )}

      {error && <p className="text-xs text-rose mb-2">{error}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
        >
          {saving ? "שומר..." : saved ? "נשמר ✓" : "שמירה"}
        </button>
        {enabled && previewUrl && (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline text-ink-soft">
            צפייה בפורטפוליו ←
          </a>
        )}
      </div>

      {liveUrl && (
        <div className="flex items-center gap-2.5 mt-3.5 pt-3.5 border-t border-line">
          <button
            onClick={copyLiveLink}
            className="rounded-lg px-3.5 py-2 text-xs font-semibold"
            style={{
              background: copied ? "var(--color-sage-bg)" : "var(--color-chip)",
              color: copied ? "var(--color-sage)" : "var(--color-ink-soft)",
            }}
          >
            {copied ? "הועתק ✓" : "העתקת קישור"}
          </button>
          <button onClick={() => setShareOpen(true)} className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-chip text-ink-soft">
            שיתוף
          </button>
        </div>
      )}

      {shareOpen && liveUrl && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.7)" }} onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {shareView === "main" ? (
              <>
                <h2 className="text-lg font-bold font-display mb-1">שיתוף הפורטפוליו</h2>
                {availableTabs.length > 1 && (
                  <>
                    <p className="text-xs text-ink-soft mb-2.5">
                      אפשר לבחור אילו לשוניות יוצגו בקישור הזה. רק מה שמסומן יופיע אצל מי שיקבל אותו.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {availableTabs.map((t) => {
                        const active = selectedTabs.has(t.key);
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => toggleTab(t.key)}
                            aria-pressed={active}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold border"
                            style={{
                              background: active ? "var(--color-amber-deep)" : "var(--color-chip)",
                              color: active ? "#fff" : "var(--color-ink-soft)",
                              borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                            }}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <div className="space-y-2.5">
                  <button
                    onClick={shareViaWhatsapp}
                    disabled={selectedTabs.size === 0}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-sage-bg text-sage disabled:opacity-50"
                  >
                    וואטסאפ
                  </button>
                  <button
                    onClick={shareViaQr}
                    disabled={selectedTabs.size === 0}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-50"
                  >
                    קוד QR
                  </button>
                  <button
                    onClick={shareViaOther}
                    disabled={selectedTabs.size === 0}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-50"
                  >
                    אחר
                  </button>
                </div>
                <button onClick={() => setShareOpen(false)} className="w-full text-center mt-4 text-xs text-ink-soft">
                  ביטול
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold font-display mb-4">קוד QR לפורטפוליו</h2>
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="קוד QR לפורטפוליו" className="w-full rounded-2xl mb-4" />
                )}
                <div className="flex gap-2">
                  <button onClick={() => setShareView("main")} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft">
                    חזרה
                  </button>
                  <button onClick={() => setShareOpen(false)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                    סגירה
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {shareStatus && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] rounded-full px-4 py-2 text-xs font-semibold bg-ink text-white shadow-sheet">
          {shareStatus}
        </div>
      )}
    </div>
  );
}
