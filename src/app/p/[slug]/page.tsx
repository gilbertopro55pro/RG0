import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getPublicPreviewUrl, getSignedDownloadUrl } from "@/lib/storage";
import { fetchAllRows } from "@/lib/paginatedFetch";
import { galleryFont } from "@/lib/galleryTheme";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import PortfolioHeroCarousel from "@/components/PortfolioHeroCarousel";
import type { GalleryPhotoRow, Photographer } from "@/lib/types";

type PortfolioPhoto = Pick<GalleryPhotoRow, "id" | "storage_path" | "preview_storage_path" | "portfolio_category" | "created_at">;

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

async function loadPortfolio(slug: string) {
  const supabase = createServiceRoleClient();
  const { data: photographer } = await supabase
    .from("photographers")
    .select("id, name, phone, portfolio_bio, logo_storage_path, portfolio_enabled, plan")
    .eq("portfolio_slug", slug)
    .maybeSingle<Pick<Photographer, "id" | "name" | "phone" | "portfolio_bio" | "logo_storage_path" | "portfolio_enabled" | "plan">>();

  if (!photographer || !photographer.portfolio_enabled) return null;
  // The real gate — PortfolioSettings.tsx disables the toggle client-side for entry-tier accounts,
  // but that's a UX courtesy, not a security boundary (portfolio_enabled could still be true from
  // before a downgrade, or from a direct API call). This is the one place every visitor's request
  // actually passes through, so it's the one place that has to be authoritative.
  if (SUBSCRIPTION_PLANS[photographer.plan].tier === "basic") return null;

  // Paginated (see fetchAllRows's own comment) — a portfolio is usually curated and small, but an
  // unbounded select here would still silently truncate for a photographer who marks a very large
  // number of photos "in portfolio".
  const photos = await fetchAllRows<PortfolioPhoto>((from, to) =>
    supabase
      .from("gallery_photos")
      .select("id, storage_path, preview_storage_path, portfolio_category, created_at")
      .eq("photographer_id", photographer.id)
      .eq("in_portfolio", true)
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<PortfolioPhoto[]>()
  );

  return { photographer, photos };
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

// Sentinel for "uncategorized" inside the `tabs` param — mirrors PortfolioManagePanel's own
// UNCATEGORIZED constant, kept separate since that one's a client component.
const NO_CATEGORY_TAB = "__none__";
const HERO_PHOTO_CAP = 15; // up to 5 slides of 3 — plenty of variety without an unbounded sample

export default async function PortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // `tabs` is a curated-share restriction set by PortfolioSettings.tsx's share sheet: a
  // comma-separated, percent-encoded list of the categories (plus NO_CATEGORY_TAB for
  // uncategorized) that ONE particular shared link is allowed to show. Absent entirely (the
  // default "העתקת קישור" link, and every link before this feature existed) means "show
  // everything" — unrestricted. A category name containing a literal comma won't round-trip
  // through this correctly; accepted as a rare-enough edge case not worth double-encoding for.
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

  const allowedTabs = tabsParam ? new Set(tabsParam.split(",").map((t) => decodeURIComponent(t))) : null;
  const scopedPhotos = allowedTabs
    ? allPhotos.filter((p) => allowedTabs.has(p.portfolio_category ?? NO_CATEGORY_TAB))
    : allPhotos;

  // Tab links need to carry the same restriction forward, or clicking between tabs on a curated
  // link would silently widen back out to the whole portfolio.
  const tabsSuffix = tabsParam ? `&tabs=${tabsParam}` : "";

  const categories = Array.from(new Set(scopedPhotos.map((p) => p.portfolio_category).filter((c): c is string => !!c)));
  const photos = activeCategory ? scopedPhotos.filter((p) => p.portfolio_category === activeCategory) : scopedPhotos;

  // One representative photo per category tile — the most recent tagged with it, since
  // scopedPhotos is already ordered newest-first.
  const categoryRepresentative = new Map<string, PortfolioPhoto>();
  for (const p of scopedPhotos) {
    if (p.portfolio_category && !categoryRepresentative.has(p.portfolio_category)) categoryRepresentative.set(p.portfolio_category, p);
  }
  // A random sample, not just the first N — otherwise the hero would always open on the same
  // handful of photos on every visit instead of feeling like a living showcase.
  const heroCandidates = [...scopedPhotos].sort(() => Math.random() - 0.5).slice(0, HERO_PHOTO_CAP);

  // Sign only the photos actually needed — the active tab's grid, one per category tile, and the
  // hero sample — instead of every scoped photo unconditionally. A photographer with many tabs
  // shouldn't pay to sign every OTHER tab's photos just because one tab was opened.
  const needed = new Map<string, PortfolioPhoto>();
  for (const p of [...photos, ...categoryRepresentative.values(), ...heroCandidates]) needed.set(p.id, p);
  const urlById = new Map<string, string>();
  await Promise.all(
    Array.from(needed.values()).map(async (p) => {
      urlById.set(
        p.id,
        p.preview_storage_path?.endsWith(".webp")
          ? getPublicPreviewUrl(p.preview_storage_path)
          : await getSignedDownloadUrl("galleries", p.storage_path, 60 * 60 * 24)
      );
    })
  );

  const photosWithUrls = photos.map((p) => ({ id: p.id, url: urlById.get(p.id)! }));
  const categoryThumb = new Map(Array.from(categoryRepresentative.entries()).map(([cat, p]) => [cat, urlById.get(p.id)!]));
  const heroPhotos = heroCandidates.map((p) => ({ id: p.id, url: urlById.get(p.id)! }));

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
            סוגי אירועים
          </p>
          <div className="flex flex-wrap justify-center gap-5 max-w-4xl mx-auto">
            <a
              href={tabsParam ? `/p/${slug}?tabs=${tabsParam}` : `/p/${slug}`}
              className="flex flex-col items-center gap-2 w-20"
            >
              <span
                className="h-20 w-20 rounded-lg flex items-center justify-center text-[11px] font-semibold"
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
              <a key={c} href={`/p/${slug}?category=${encodeURIComponent(c)}${tabsSuffix}`} className="flex flex-col items-center gap-2 w-20">
                <span
                  className="h-20 w-20 rounded-lg overflow-hidden bg-black/40"
                  style={{ boxShadow: activeCategory === c ? `0 0 0 2px ${BRASS}` : undefined }}
                >
                  {categoryThumb.has(c) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={categoryThumb.get(c)} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="text-[11px] truncate max-w-full" style={{ color: activeCategory === c ? "#f2f2ee" : TEXT_SOFT }}>
                  {c}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 sm:px-6 py-10" style={{ background: INK }}>
        {photos.length === 0 ? (
          <p className="text-center text-sm py-16" style={{ color: TEXT_SOFT }}>
            {activeCategory ? "אין עדיין תמונות בנושא הזה." : "תיק העבודות עדיין ריק."}
          </p>
        ) : (
          <div className="columns-2 md:columns-3 gap-1 [column-fill:_balance] max-w-5xl mx-auto">
            {photosWithUrls.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt="" className="w-full h-auto mb-1 break-inside-avoid" loading="lazy" />
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] py-8" style={{ background: INK, color: TEXT_SOFT }}>
        תיק עבודות שנבנה עם{" "}
        <a href="/" className="underline">
          גילברטו
        </a>
      </p>
    </div>
  );
}
