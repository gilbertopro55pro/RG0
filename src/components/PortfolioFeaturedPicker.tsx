"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/paginatedFetch";

const MAX_FEATURED = 25; // mirrors the enforce_portfolio_featured trigger (migration 0125)
const PAGE_SIZE = 60;
const FILTER_FEATURED = "__featured__";
const FILTER_ALL = "__all__";
const FILTER_UNCATEGORIZED = "__none__";

type PickerPhoto = { id: string; gallery_id: string; portfolio_featured: boolean };

// Lets the photographer star which portfolio photos appear in the public portfolio's hero strip
// (PortfolioHeroCarousel.tsx) — up to MAX_FEATURED. Browsable by tab and paged, since a portfolio
// can hold thousands of photos; thumbnails come from the same authenticated preview route the
// gallery manager uses. The DB trigger is the real cap — this UI just explains it up front.
export default function PortfolioFeaturedPicker({ photographerId }: { photographerId: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [featuredCount, setFeaturedCount] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [hasUncategorized, setHasUncategorized] = useState(false);
  const [filter, setFilter] = useState(FILTER_ALL);
  const [photos, setPhotos] = useState<PickerPhoto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshCount = async () => {
    const { count } = await supabase
      .from("gallery_photos")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .eq("portfolio_featured", true);
    setFeaturedCount(count ?? 0);
    return count ?? 0;
  };

  // The X/25 counter shows even while the panel is collapsed — cheap head-only count query.
  useEffect(() => {
    // Fetching from the DB on mount is exactly what this effect is for — the state it sets comes
    // from that external system, not derived from props, so the rule's concern doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photographerId]);

  // Tab list loads once when the panel is opened (not on every settings visit).
  useEffect(() => {
    if (!open) return;
    (async () => {
      const count = await refreshCount();
      const rows = await fetchAllRows<{ portfolio_category: string | null }>((from, to) =>
        supabase.from("gallery_photos").select("portfolio_category").eq("photographer_id", photographerId).eq("in_portfolio", true).range(from, to)
      );
      setCategories(Array.from(new Set(rows.map((r) => r.portfolio_category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "he")));
      setHasUncategorized(rows.some((r) => !r.portfolio_category));
      // Opening straight into "what's already starred" is the useful default once there is any.
      setFilter(count > 0 ? FILTER_FEATURED : FILTER_ALL);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photographerId]);

  const loadPage = async (reset: boolean) => {
    setLoading(true);
    const from = reset ? 0 : photos.length;
    let query = supabase
      .from("gallery_photos")
      .select("id, gallery_id, portfolio_featured")
      .eq("photographer_id", photographerId)
      .eq("in_portfolio", true);
    if (filter === FILTER_FEATURED) query = query.eq("portfolio_featured", true);
    else if (filter === FILTER_UNCATEGORIZED) query = query.is("portfolio_category", null);
    else if (filter !== FILTER_ALL) query = query.eq("portfolio_category", filter);
    const { data } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1).returns<PickerPhoto[]>();
    const rows = data ?? [];
    setPhotos((prev) => (reset ? rows : [...prev, ...rows]));
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    // Same as above — a DB fetch keyed on the chosen filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter]);

  const toggle = async (photo: PickerPhoto) => {
    const next = !photo.portfolio_featured;
    if (next && featuredCount >= MAX_FEATURED) {
      setMessage(`אפשר לסמן עד ${MAX_FEATURED} תמונות, הסירו כוכב מתמונה אחרת קודם`);
      return;
    }
    setMessage(null);
    // Optimistic — flipped back below if the DB (the real cap) refuses it.
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, portfolio_featured: next } : p)));
    setFeaturedCount((c) => c + (next ? 1 : -1));
    const { error } = await supabase.from("gallery_photos").update({ portfolio_featured: next }).eq("id", photo.id);
    if (error) {
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, portfolio_featured: !next } : p)));
      await refreshCount();
      setMessage(error.message.includes("portfolio_featured_limit") ? `אפשר לסמן עד ${MAX_FEATURED} תמונות` : "שגיאה בשמירה. נסו שוב");
    }
  };

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold">תמונות לרצועה הראשית</p>
        <span className="text-xs font-data text-ink-soft">
          {featuredCount}/{MAX_FEATURED}
        </span>
      </div>
      <p className="text-xs text-ink-soft mb-3">
        סמנו בכוכב עד {MAX_FEATURED} תמונות מהפורטפוליו. רק הן יופיעו ברצועת התמונות הגדולות שמתחלפת בראש העמוד. בלי תמונות
        מסומנות, הרצועה לא תוצג.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-chip text-ink">
          בחירת תמונות
        </button>
      ) : (
        <>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3"
          >
            <option value={FILTER_FEATURED}>מסומנות בכוכב ({featuredCount})</option>
            <option value={FILTER_ALL}>כל התמונות בפורטפוליו</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {hasUncategorized && <option value={FILTER_UNCATEGORIZED}>כללי (ללא נושא)</option>}
          </select>

          {message && <p className="text-xs text-rose mb-2">{message}</p>}

          {photos.length === 0 && !loading ? (
            <p className="text-xs text-ink-soft py-4 text-center">
              {filter === FILTER_FEATURED ? "עדיין לא סומנו תמונות. בחרו \"כל התמונות\" כדי להתחיל." : "אין תמונות כאן."}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p)}
                  aria-pressed={p.portfolio_featured}
                  aria-label={p.portfolio_featured ? "הסרת כוכב" : "סימון בכוכב"}
                  className="relative aspect-square overflow-hidden rounded-md bg-chip"
                  style={{ boxShadow: p.portfolio_featured ? "0 0 0 2px var(--color-brass)" : undefined }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/galleries/${p.gallery_id}/photos/${p.id}/preview`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span
                    className="absolute top-1 left-1 h-7 w-7 rounded-full flex items-center justify-center"
                    style={{ background: p.portfolio_featured ? "var(--color-brass)" : "rgba(0,0,0,0.45)" }}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={p.portfolio_featured ? "#fff" : "none"} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round">
                      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}

          {hasMore && (
            <button onClick={() => loadPage(false)} disabled={loading} className="w-full mt-2 rounded-lg py-2 text-xs font-semibold bg-chip text-ink-soft disabled:opacity-60">
              {loading ? "טוען..." : "טעינת עוד תמונות"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
