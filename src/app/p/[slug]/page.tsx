import type { Metadata } from "next";
import Link from "next/link";
import { galleryFont } from "@/lib/galleryTheme";
import { getSignedDownloadUrl } from "@/lib/storage";
import PortfolioHeroCarousel from "@/components/PortfolioHeroCarousel";
import PortfolioBrowser from "@/components/PortfolioBrowser";
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
  const title = `${data.photographer.name} | תיק עבודות`;
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

  const categories = Array.from(new Set(scopedPhotos.map((p) => p.portfolio_category).filter((c): c is string => !!c)));

  // One representative photo per category tile: the cover the photographer picked for that tab
  // (Settings › פורטפוליו, photographers.portfolio_category_covers) while it's still in that tab,
  // otherwise the most recent tagged with it (scopedPhotos is already ordered newest-first).
  const covers = photographer.portfolio_category_covers ?? {};
  const categoryRepresentative = new Map<string, PortfolioPhoto>();
  for (const p of scopedPhotos) {
    const c = p.portfolio_category;
    if (c && (!categoryRepresentative.has(c) || covers[c] === p.id)) categoryRepresentative.set(c, p);
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
        <div className="flex items-center gap-2 shrink-0">
        {/* The intake assistant's chat (עוזר פניות) — the page falls back to a plain inquiry
            form by itself if the assistant is unavailable, so the button is safe to show. */}
        {photographer.intake_bot_enabled && (
          <a
            href={`/chat/${slug}?src=portfolio`}
            className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold border"
            style={{ borderColor: BRASS, color: BRASS }}
          >
            בדיקת תאריך
          </a>
        )}
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
        </div>
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

      {/* The tab tiles and the grid: tabs switch in place, without reloading the page. */}
      <PortfolioBrowser
        slug={slug}
        tabs={tabsParam}
        categories={categories.map((c) => ({ name: c, thumb: categoryThumb.get(c) ?? null }))}
        initialCategory={activeCategory}
        initialPhotos={gridInitial}
        initialHasMore={gridPhotos.length > firstPage.length}
      />

      <p className="text-center text-[11px] py-8" style={{ background: INK, color: TEXT_SOFT }}>
        תיק עבודות שנבנה עם{" "}
        <Link href="/" className="underline">
          גילברטו
        </Link>
      </p>
    </div>
  );
}
