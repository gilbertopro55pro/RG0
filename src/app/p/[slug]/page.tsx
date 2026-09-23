import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getPublicPreviewUrl, getSignedDownloadUrl } from "@/lib/storage";
import { fetchAllRows } from "@/lib/paginatedFetch";
import { galleryFont } from "@/lib/galleryTheme";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import type { GalleryPhotoRow, Photographer } from "@/lib/types";

type PortfolioPhoto = Pick<GalleryPhotoRow, "id" | "storage_path" | "preview_storage_path" | "portfolio_category" | "created_at">;

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
      <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
        <p className="text-sm text-ink-soft">תיק העבודות לא נמצא.</p>
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

  const photosWithUrls = await Promise.all(
    photos.map(async (p) => ({
      id: p.id,
      url:
        p.preview_storage_path?.endsWith(".webp")
          ? getPublicPreviewUrl(p.preview_storage_path)
          : await getSignedDownloadUrl("galleries", p.storage_path, 60 * 60 * 24),
    }))
  );

  const logoUrl = photographer.logo_storage_path
    ? await getSignedDownloadUrl("logos", photographer.logo_storage_path, 60 * 60 * 24)
    : null;

  const contactHref = photographer.phone
    ? buildWaMeLink(photographer.phone, `שלום ${photographer.name}, ראיתי את תיק העבודות שלך ואשמח לשמוע פרטים`)
    : null;

  return (
    <div className={`${galleryFont.variable} max-w-3xl mx-auto px-4 pt-10 pb-16 w-full min-h-screen`}>
      <header className="text-center mb-10">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-14 w-auto object-contain mx-auto mb-4" />
        )}
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-gallery-serif)" }}>
          {photographer.name}
        </h1>
        {contactHref && (
          <a
            href={contactHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 rounded-full px-5 py-2.5 text-sm font-semibold bg-amber-deep text-white"
          >
            יצירת קשר
          </a>
        )}
      </header>

      {/* The photographer's own "get to know me" area — populated from portfolio_bio (see the
          "טקסט פתיחה" field in PortfolioSettings.tsx). Its own card rather than a plain line under
          the header, so it reads as a deliberate introduction rather than a caption. */}
      {photographer.portfolio_bio && (
        <div className="max-w-lg mx-auto mb-10 rounded-2xl p-5 bg-card border border-line text-center">
          <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">{photographer.portfolio_bio}</p>
        </div>
      )}

      {categories.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          <a
            href={tabsParam ? `/p/${slug}?tabs=${tabsParam}` : `/p/${slug}`}
            className="rounded-full px-4 py-1.5 text-xs font-semibold"
            style={{
              background: !activeCategory ? "var(--color-amber-deep)" : "var(--color-chip)",
              color: !activeCategory ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            הכל
          </a>
          {categories.map((c) => (
            <a
              key={c}
              href={`/p/${slug}?category=${encodeURIComponent(c)}${tabsSuffix}`}
              className="rounded-full px-4 py-1.5 text-xs font-semibold"
              style={{
                background: activeCategory === c ? "var(--color-amber-deep)" : "var(--color-chip)",
                color: activeCategory === c ? "#fff" : "var(--color-ink-soft)",
              }}
            >
              {c}
            </a>
          ))}
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-center text-sm text-ink-soft py-16">
          {activeCategory ? "אין עדיין תמונות בנושא הזה." : "תיק העבודות עדיין ריק."}
        </p>
      ) : (
        <div className="columns-2 md:columns-3 gap-2 [column-fill:_balance]">
          {photosWithUrls.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url} alt="" className="w-full h-auto mb-2 rounded-lg break-inside-avoid" loading="lazy" />
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-ink-soft mt-14">
        תיק עבודות שנבנה עם{" "}
        <a href="/" className="underline">
          גילברטו
        </a>
      </p>
    </div>
  );
}
