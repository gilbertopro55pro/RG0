"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PortfolioGrid, { type GridPhoto } from "@/components/PortfolioGrid";
import PortfolioHeroStrip, { STRIP_HEIGHT, type HeroPhoto } from "@/components/PortfolioHeroStrip";
import { subTabLabel } from "@/lib/portfolioNames";

const BRASS = "#c9a24b";
const TEXT_SOFT = "#b7b7bd";

type Loaded = { photos: GridPhoto[]; hasMore: boolean };

const scopeKey = (category?: string, sub?: string) => `${category ?? ""}|${sub ?? ""}`;

// The public portfolio below the header: the top strip, the intro, the tab tiles, a tab's
// sub-tabs and the photo grid. Tapping a tab or sub-tab switches in place (owner, 2026-10-10:
// "המעבר יהיה חלק בלי מסך הטעינה"): the address changes with pushState, so the link and the back
// button still work, but nothing reloads. A scope's first page comes from
// /api/portfolio/[slug]/photos, and what was loaded is kept, so going back is instant.
// The strip shows the starred photos on "הכל" and a random mix of the open tab (or sub-tab).
export default function PortfolioBrowser({
  slug,
  tabs,
  categories,
  subTabs,
  initialCategory,
  initialSub,
  initialPhotos,
  initialHasMore,
  starredHero,
  initialHero,
  intro,
}: {
  slug: string;
  tabs?: string;
  categories: { name: string; thumb: string | null }[];
  // Each tab's sub-tabs, in order.
  subTabs: Record<string, string[]>;
  initialCategory?: string;
  initialSub?: string;
  initialPhotos: GridPhoto[];
  initialHasMore: boolean;
  starredHero: HeroPhoto[];
  // The strip for the scope the page opened on (a sample of that tab, or the starred photos).
  initialHero: HeroPhoto[];
  intro?: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const active = searchParams.get("category") ?? undefined;
  const sub = active ? (searchParams.get("sub") ?? undefined) : undefined;
  const key = scopeKey(active, sub);
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(
    () => new Map([[scopeKey(initialCategory, initialSub), { photos: initialPhotos, hasMore: initialHasMore }]])
  );
  const [heroes, setHeroes] = useState<Map<string, HeroPhoto[]>>(
    () => new Map(initialCategory ? [[scopeKey(initialCategory, initialSub), initialHero]] : [])
  );
  const current = loaded.get(key);
  const hero = active ? heroes.get(key) : starredHero;

  const hrefFor = (category?: string, subTab?: string) => {
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (category && subTab) qs.set("sub", subTab);
    if (tabs) qs.set("tabs", tabs);
    const query = qs.toString();
    return `/p/${slug}${query ? `?${query}` : ""}`;
  };
  // A plain link stays (open in a new tab works); a normal tap switches in place.
  const select = (e: React.MouseEvent, category?: string, subTab?: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (category === active && subTab === sub) return;
    window.history.pushState(null, "", hrefFor(category, subTab));
  };

  // A tab's strip: a fresh random mix the first time it's opened, then kept.
  useEffect(() => {
    if (!active || heroes.has(key)) return;
    let cancelled = false;
    const qs = new URLSearchParams({ sample: "1", category: active });
    if (sub) qs.set("sub", sub);
    if (tabs) qs.set("tabs", tabs);
    fetch(`/api/portfolio/${encodeURIComponent(slug)}/photos?${qs}`)
      .then((res) => (res.ok ? res.json() : { photos: [] }))
      .then((data: { photos: HeroPhoto[] }) => {
        if (!cancelled) setHeroes((prev) => new Map(prev).set(key, data.photos));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active, sub, key, heroes, slug, tabs]);

  const subs = active ? (subTabs[active] ?? []) : [];

  return (
    <>
      {/* Same height while a tab's strip is on its way, so the page doesn't jump. */}
      {hero ? <PortfolioHeroStrip key={key} photos={hero} /> : active ? <div style={{ height: STRIP_HEIGHT, background: "#0b0b0d" }} /> : null}

      {intro}

      {/* Category navigation as photo tiles rather than plain pills — each tab is a real image from
          that category (the cover the photographer picked, or its newest photo), matching a
          photography portfolio's own visual language. */}
      {categories.length > 0 && (
        <div className="px-6 py-12" style={{ background: "#151517" }}>
          <p className="text-center text-xs font-semibold mb-6" style={{ color: TEXT_SOFT }}>
            נושאים
          </p>
          <div className="flex flex-wrap justify-center gap-5 max-w-4xl mx-auto select-none" style={{ WebkitTouchCallout: "none" }}>
            <a href={hrefFor()} onClick={(e) => select(e)} className="flex flex-col items-center gap-2 w-24" aria-current={!active ? "page" : undefined}>
              <span
                className="h-24 w-24 rounded-lg flex items-center justify-center text-[11px] font-semibold transition-shadow"
                style={{
                  background: !active ? BRASS : "#232326",
                  color: !active ? "#1a1408" : TEXT_SOFT,
                  boxShadow: !active ? `0 0 0 2px ${BRASS}` : undefined,
                }}
              >
                הכל
              </span>
              <span className="text-[11px]" style={{ color: !active ? "#f2f2ee" : TEXT_SOFT }}>
                הכל
              </span>
            </a>
            {categories.map((c) => (
              <a
                key={c.name}
                href={hrefFor(c.name)}
                onClick={(e) => select(e, c.name)}
                className="flex flex-col items-center gap-2 w-24"
                aria-current={active === c.name ? "page" : undefined}
              >
                <span
                  className="h-24 w-24 rounded-lg overflow-hidden bg-black/40 transition-shadow"
                  style={{ boxShadow: active === c.name ? `0 0 0 2px ${BRASS}` : undefined }}
                >
                  {c.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumb} alt="" draggable={false} className="h-full w-full object-cover" onContextMenu={(e) => e.preventDefault()} />
                  )}
                </span>
                <span className="text-[11px] leading-snug text-center line-clamp-2 max-w-full" style={{ color: active === c.name ? "#f2f2ee" : TEXT_SOFT }}>
                  {c.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 sm:px-6 py-10 min-h-[60vh]" style={{ background: "#0b0b0d" }}>
        {/* The open tab's sub-tabs (e.g. הכנות, ריקודים inside חתונה): "הכל" is the whole tab. */}
        {subs.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto mb-8">
            {[undefined, ...subs].map((s) => {
              const on = s === sub;
              return (
                <a
                  key={s ?? ""}
                  href={hrefFor(active, s)}
                  onClick={(e) => select(e, active, s)}
                  aria-current={on ? "page" : undefined}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold border transition-colors"
                  style={{ borderColor: on ? BRASS : "#2e2e33", background: on ? BRASS : "transparent", color: on ? "#1a1408" : TEXT_SOFT }}
                >
                  {/* "1.הכנות" shows as "הכנות": the folder number only sets the order. */}
                  {s ? subTabLabel(s) : "הכל"}
                </a>
              );
            })}
          </div>
        )}
        <PortfolioGrid
          key={`${key}|${tabs ?? ""}`}
          slug={slug}
          initialPhotos={current?.photos ?? []}
          initialHasMore={current ? current.hasMore : true}
          category={active}
          sub={sub}
          tabs={tabs}
          emptyText={active ? "אין עדיין תמונות בנושא הזה." : "תיק העבודות עדיין ריק."}
          onPhotos={(photos, hasMore) => setLoaded((prev) => new Map(prev).set(key, { photos, hasMore }))}
        />
      </div>
    </>
  );
}
