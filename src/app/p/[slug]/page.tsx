import type { Metadata } from "next";
import Link from "next/link";
import { galleryFont } from "@/lib/galleryTheme";
import { getSignedDownloadUrl } from "@/lib/storage";
import PortfolioHeroCarousel from "@/components/PortfolioHeroCarousel";
import PortfolioGrid from "@/components/PortfolioGrid";
import {
  loadPortfolio,
  scopePortfolioPhotos,
  signPortfolioPhotos,
  PORTFOLIO_PAGE_SIZE,
  PORTFOLIO_FEATURED_MAX,
  type PortfolioPhoto,
} from "@/lib/portfolio";

// A dark, editorial shell distinct from the rest of the app's own (light, admin-panel) design
// system — this is a public showcase page a photographer hands to potential clients, not a
// workspace screen, so it gets its own visual identity instead of inheriting bg-card/bg-chip/etc.
// Colors are hardcoded rather than reading the shared --color-* tokens: this page's look shouldn't
// change based on a visitor's OS light/dark preference the way the rest of the app does.
const INK = "#0b0b0d";
const INK_RAISED = "#151517";
const TEXT_SOFT = "#b7b7bd";
const BRASS = "#c9a24b"; // the app's existing --color-brass, used here as the one deliberate
// "premium" accent — see the 2026-09-23 brand critique's recommendation to lean on it as THE
// accent instead of spreading attention across many decorative pastels.

// A local copy rather than importing src/lib/waLink.ts — that file is marked "use client" (it
// also exports a window.open-based helper), and a Server Component importing it crashes at
// runtime in production the moment this function is actually called, even though it's pure and
// has no client-only dependency itself. Keep this in sync with normalizeIsraeliPhone if it changes.
function buildWaMeLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("972") ? digits : digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPortfolio(slug);
  if (!data) return {};
  const title = `${data.photographer.name} — תיק עבודות`;
  return {
    title,
    description: data.photographer.portfolio_bio || "תיק עבודות צילום",
    openGraph: { title, siteName: "גילברטו" },
  };
}

export default async function PortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // `tabs`: curated-share restriction — see scopePortfolioPhotos in src/lib/portfolio.ts.
  searchParams: Promise<{ category?: string; tabs?: string }>;
}) {
  const { slug } = await params;
  const { category: activeCategory, tabs: tabsParam } = await searchParams;
  const data = await loadPortfolio(slug);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: INK, color: TEXT_SOFT }}>
        <p className="text-sm">תיק העבודות לא נמצא.</p>
      </div>
    );
  }

  const { photographer, photos: allPhotos } = data;

  const { scopedPhotos, gridPhotos } = scopePortfolioPhotos(allPhotos, tabsParam, activeCategory);

  // Tab links need to carry the same restriction forward, or clicking between tabs on a curated
  // link would silently widen back out to the whole portfolio.
  const tabsSuffix = tabsParam ? `&tabs=${tabsParam}` : "";

  const categories = Array.from(new Set(scopedPhotos.map((p) => p.portfolio_category).filter((c): c is string => !!c)));

  // One representative photo per category tile — the most recent tagged with it, since
  // scopedPhotos is already ordered newest-first.
  const categoryRepresentative = new Map<string, PortfolioPhoto>();
  for (const p of scopedPhotos) {
    if (p.portfolio_category && !categoryRepresentative.has(p.portfolio_category)) categoryRepresentative.set(p.portfolio_category, p);
  }
  // Hero strip = only the photos the photographer starred (PortfolioFeaturedPicker.tsx), still
  // within this link's `tabs` scope. None starred → no strip at all, rather than a random pick.
  const heroSource = scopedPhotos.filter((p) => p.portfolio_featured).slice(0, PORTFOLIO_FEATURED_MAX);
  // Only the first grid page is rendered (and signed) here — PortfolioGrid.tsx loads the rest
  // from /api/portfolio/[slug]/photos as the visitor scrolls.
  const firstPage = gridPhotos.slice(0, PORTFOLIO_PAGE_SIZE);

  const needed = new Map<string, PortfolioPhoto>();
  for (const p of [...firstPage, ...categoryRepresentative.values(), ...heroSource]) needed.set(p.id, p);
  const urlById = await signPortfolioPhotos(Array.from(needed.values()));

  const gridInitial = firstPage.map((p) => ({ id: p.id, url: urlById.get(p.id)! }));
  const categoryThumb = new Map(Array.from(categoryRepresentative.entries()).map(([cat, p]) => [cat, urlById.get(p.id)!]));
  const heroPhotos = heroSource.map((p) => ({ id: p.id, url: urlById.get(p.id)! }));

  const logoUrl = photographer.logo_storage_path
    ? await getSignedDownloadUrl("logos", photographer.logo_storage_path, 60 * 60 * 24)
    : null;

  const contactHref = photographer.phone
    ? buildWaMeLink(photographer.phone, `שלום ${photographer.name}, ראיתי את תיק העבודות שלך ואשמח לשמוע פרטים`)
    : null;

  return (
    <div className={`${galleryFont.variable} min-h-screen w-full`} style={{ background: INK }}>
      {/* Nav strip — logo/name on the right (RTL start), contact CTA on the left. Deliberately
          minimal chrome, matching a real photography portfolio site rather than the app's own
          admin-panel header. */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
          )}
          <span className="text-sm font-semibold truncate" style={{ color: "#f2f2ee" }}>
            {photographer.name}
          </span>
        </div>
        {contactHref && (
          <a
            href={contactHref}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold"
            style={{ background: BRASS, color: "#1a1408" }}
          >
            יצירת קשר
          </a>
        )}
      </header>

      <PortfolioHeroCarousel photos={heroPhotos} />

      {/* "Get to know me" — populated from portfolio_bio (the "טקסט פתיחה" field in
          PortfolioSettings.tsx). Full-bleed dark band rather than a floating card, so it reads as
          part of the same editorial page instead of a bolted-on admin-style panel. */}
      {photographer.portfolio_bio && (
        <div className="px-6 py-14 text-center" style={{ background: INK }}>
          <h2 className="text-2xl mb-4" style={{ fontFamily: "var(--font-gallery-serif)", color: "#f2f2ee" }}>
            {photographer.name}
          </h2>
          <p className="max-w-xl mx-auto text-sm leading-relaxed whitespace-pre-line" style={{ color: TEXT_SOFT }}>
            {photographer.portfolio_bio}
          </p>
        </div>
      )}

      {/* Category navigation as photo tiles rather than plain pills — each tab is a real image
          from that category, not just a label, matching a photography portfolio's own visual
          language (a tab bar of text pills is the one place this page still looked like the
          app's admin UI instead of a showcase). */}
      {categories.length > 0 && (
        <div className="px-6 py-12" style={{ background: INK_RAISED }}>
          <p className="text-center text-xs font-semibold tracking-widest mb-6" style={{ color: TEXT_SOFT }}>
            נושאים
          </p>
          <div className="flex flex-wrap justify-center gap-5 max-w-4xl mx-auto">
            <a
              href={tabsParam ? `/p/${slug}?tabs=${tabsParam}` : `/p/${slug}`}
              className="flex flex-col items-center gap-2 w-24"
            >
              <span
                className="h-24 w-24 rounded-lg flex items-center justify-center text-[11px] font-semibold"
                style={{
                  background: !activeCategory ? BRASS : "#232326",
                  color: !activeCategory ? "#1a1408" : TEXT_SOFT,
                  boxShadow: !activeCategory ? `0 0 0 2px ${BRASS}` : undefined,
                }}
              >
                הכל
              </span>
              <span className="text-[11px]" style={{ color: !activeCategory ? "#f2f2ee" : TEXT_SOFT }}>
                הכל
              </span>
            </a>
            {categories.map((c) => (
              <a key={c} href={`/p/${slug}?category=${encodeURIComponent(c)}${tabsSuffix}`} className="flex flex-col items-center gap-2 w-24">
                <span
                  className="h-24 w-24 rounded-lg overflow-hidden bg-black/40"
                  style={{ boxShadow: activeCategory === c ? `0 0 0 2px ${BRASS}` : undefined }}
                >
                  {categoryThumb.has(c) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={categoryThumb.get(c)} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="text-[11px] leading-snug text-center line-clamp-2 max-w-full" style={{ color: activeCategory === c ? "#f2f2ee" : TEXT_SOFT }}>
                  {c}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 sm:px-6 py-10" style={{ background: INK }}>
        {gridPhotos.length === 0 ? (
          <p className="text-center text-sm py-16" style={{ color: TEXT_SOFT }}>
            {activeCategory ? "אין עדיין תמונות בנושא הזה." : "תיק העבודות עדיין ריק."}
          </p>
        ) : (
          <PortfolioGrid
            key={`${activeCategory ?? ""}|${tabsParam ?? ""}`}
            slug={slug}
            initialPhotos={gridInitial}
            initialHasMore={gridPhotos.length > firstPage.length}
            category={activeCategory}
            tabs={tabsParam}
          />
        )}
      </div>

      <p className="text-center text-[11px] py-8" style={{ background: INK, color: TEXT_SOFT }}>
        תיק עבודות שנבנה עם{" "}
        <Link href="/" className="underline">
          גילברטו
        </Link>
      </p>
    </div>
  );
}
