import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getPublicPreviewUrl, getSignedDownloadUrl } from "@/lib/storage";
import { fetchAllRows } from "@/lib/paginatedFetch";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import type { GalleryPhotoRow, Photographer } from "@/lib/types";
import { sortSubTabs } from "@/lib/portfolioNames";

// Server-only helpers shared by the public portfolio page (src/app/p/[slug]/page.tsx) and its
// "load more" API (src/app/api/portfolio/[slug]/photos/route.ts) — both MUST gate and scope
// exactly the same way, or the API would become a way around a curated share link's `tabs`
// restriction (or a disabled/downgraded portfolio).

export type PortfolioPhoto = Pick<
  GalleryPhotoRow,
  | "id"
  | "storage_path"
  | "preview_storage_path"
  | "preview_aspect_ratio"
  | "portfolio_category"
  | "portfolio_subcategory"
  | "portfolio_featured"
  | "created_at"
>;

// Sentinel for "uncategorized" inside the `tabs` param — mirrors PortfolioManagePanel's own
// UNCATEGORIZED constant (and PortfolioSettings.tsx's copy of this one).
export const NO_CATEGORY_TAB = "__none__";
export const PORTFOLIO_PAGE_SIZE = 48;
export const PORTFOLIO_FEATURED_MAX = 25; // mirrors the enforce_portfolio_featured trigger (0125)

export async function loadPortfolio(slug: string) {
  const supabase = createServiceRoleClient();
  const { data: photographer } = await supabase
    .from("photographers")
    .select("id, name, phone, portfolio_bio, logo_storage_path, portfolio_enabled, plan, intake_bot_enabled, portfolio_category_covers")
    .eq("portfolio_slug", slug)
    .maybeSingle<
      Pick<
        Photographer,
        "id" | "name" | "phone" | "portfolio_bio" | "logo_storage_path" | "portfolio_enabled" | "plan" | "intake_bot_enabled" | "portfolio_category_covers"
      >
    >();

  if (!photographer || !photographer.portfolio_enabled) return null;
  // The real gate — PortfolioSettings.tsx disables the toggle client-side for entry-tier accounts,
  // but that's a UX courtesy, not a security boundary (portfolio_enabled could still be true from
  // before a downgrade, or from a direct API call). Every visitor request passes through here.
  if (SUBSCRIPTION_PLANS[photographer.plan].tier === "basic") return null;

  // Metadata only (no signing) — cheap even for thousands of photos; signing is what's expensive,
  // and that happens per page via signPortfolioPhotos below.
  const photos = await fetchAllRows<PortfolioPhoto>((from, to) =>
    supabase
      .from("gallery_photos")
      .select("id, storage_path, preview_storage_path, preview_aspect_ratio, portfolio_category, portfolio_subcategory, portfolio_featured, created_at")
      .eq("photographer_id", photographer.id)
      .eq("in_portfolio", true)
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<PortfolioPhoto[]>()
  );

  return { photographer, photos };
}

// `tabs` is a curated-share restriction set by PortfolioSettings.tsx's share sheet: a
// comma-separated, percent-encoded list of categories (plus NO_CATEGORY_TAB) that one shared link
// may show. Absent = everything. A category name containing a literal comma won't round-trip;
// accepted as a rare-enough edge case not worth double-encoding for.
// `activeSub` narrows a tab to one of its sub-tabs (portfolio_subcategory); the tab itself shows
// all its photos, sub-tabs included. Sub-tabs follow their tab's `tabs` restriction.
export function scopePortfolioPhotos(
  allPhotos: PortfolioPhoto[],
  tabsParam: string | undefined,
  activeCategory: string | undefined,
  activeSub?: string | undefined
) {
  const allowedTabs = tabsParam ? new Set(tabsParam.split(",").map((t) => decodeURIComponent(t))) : null;
  const scopedPhotos = allowedTabs ? allPhotos.filter((p) => allowedTabs.has(p.portfolio_category ?? NO_CATEGORY_TAB)) : allPhotos;
  // Filtered from scopedPhotos, never allPhotos — a hand-edited `category=` naming a tab outside
  // the allowed set just yields nothing, instead of leaking that tab.
  const tabPhotos = activeCategory ? scopedPhotos.filter((p) => p.portfolio_category === activeCategory) : scopedPhotos;
  const gridPhotos = activeCategory && activeSub ? tabPhotos.filter((p) => p.portfolio_subcategory === activeSub) : tabPhotos;
  return { scopedPhotos, gridPhotos };
}

// Each tab's sub-tabs: numbered ones ("1.הכנות", from numbered folders) by their number, the rest
// after them in the order they were started (by their oldest photo).
export function portfolioSubTabs(scopedPhotos: PortfolioPhoto[]): Record<string, string[]> {
  const first = new Map<string, Map<string, string>>();
  for (const p of scopedPhotos) {
    if (!p.portfolio_category || !p.portfolio_subcategory) continue;
    let subs = first.get(p.portfolio_category);
    if (!subs) first.set(p.portfolio_category, (subs = new Map()));
    const seen = subs.get(p.portfolio_subcategory);
    if (!seen || p.created_at < seen) subs.set(p.portfolio_subcategory, p.created_at);
  }
  return Object.fromEntries(
    [...first.entries()].map(([tab, subs]) => [
      tab,
      sortSubTabs(
        [...subs.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([name]) => name),
        (name) => name
      ),
    ])
  );
}

export const PORTFOLIO_HERO_SAMPLE = 14;

// The hero strip inside a tab (owner, 2026-10-10): photos picked at random from it, landscape and
// portrait alike, alternating while both last so the strip never reads as all one shape.
export function sampleHeroPhotos(photos: PortfolioPhoto[], n = PORTFOLIO_HERO_SAMPLE): PortfolioPhoto[] {
  const shuffled = [...photos];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const wide = shuffled.filter((p) => (p.preview_aspect_ratio ?? 1.5) >= 1);
  const tall = shuffled.filter((p) => (p.preview_aspect_ratio ?? 1.5) < 1);
  const out: PortfolioPhoto[] = [];
  while (out.length < n && (wide.length || tall.length)) {
    const next = (out.length % 2 === 0 ? wide.shift() ?? tall.shift() : tall.shift() ?? wide.shift())!;
    out.push(next);
  }
  return out;
}

export async function signPortfolioPhotos(photos: PortfolioPhoto[]): Promise<Map<string, string>> {
  const urlById = new Map<string, string>();
  await Promise.all(
    photos.map(async (p) => {
      urlById.set(
        p.id,
        p.preview_storage_path?.endsWith(".webp")
          ? getPublicPreviewUrl(p.preview_storage_path)
          : await getSignedDownloadUrl("galleries", p.storage_path, 60 * 60 * 24)
      );
    })
  );
  return urlById;
}
