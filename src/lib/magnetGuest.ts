import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { clientLangFor } from "@/lib/clientLang";
import { MAGNET_GUEST_CODE_RE, magnetGuestRange, magnetPortfolioSlug } from "@/lib/magnetQr";
import type { Lang } from "@/i18n/config";
import type { MagnetFrameElement } from "@/lib/types";

// Where a magnet's guest QR (myframeflow.com/m/<code>, lib/magnetQr.ts) leads. Server only: the
// service role reads the event, its frames and its gallery, and is used only after the code has
// named one event; everything after that is scoped to that event's own photographer.
//
// - The link works only while at least one of the event's frames has a QR that opens the gallery
//   (the photographer's opt-in: removing the QR from every frame turns it off). Otherwise, or for a
//   code that names no event: "inactive".
// - The event's gallery (not the hidden portfolio gallery), published and not archived, newest
//   first: "gallery", and the guests get a read-only, web-quality share link to it
//   (magnetGuestShareToken). Never the client's own link.
// - A gallery that was archived (expired or by hand) and none live: "unavailable", as the client's
//   own link shows it.
// - No gallery yet, or not published: "soon", a page from the studio saying the photos are coming.
// A locked account (ended trial or subscription) is treated like the public gallery treats it: the
// gallery stays viewable.

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type MagnetGuestStudio = { name: string; logoPath: string | null; portfolioSlug: string | null };

export type MagnetGuestState =
  | { kind: "inactive"; lang: Lang }
  | { kind: "gallery"; lang: Lang; galleryId: string }
  | { kind: "soon" | "unavailable"; lang: Lang; studio: MagnetGuestStudio };

type EventLite = { id: string; photographer_id: string; client_lang: string | null };
type DesignLite = { landscape_elements: MagnetFrameElement[] | null; portrait_elements: MagnetFrameElement[] | null };
type GalleryLite = { id: string; published: boolean; archived_at: string | null; created_at: string };
type StudioRow = { name: string | null; email: string | null; logo_storage_path: string | null; portfolio_slug: string | null; portfolio_enabled: boolean | null };

export function hasGalleryQr(designs: DesignLite[] | null | undefined): boolean {
  return (designs ?? []).some((d) =>
    [...(Array.isArray(d.landscape_elements) ? d.landscape_elements : []), ...(Array.isArray(d.portrait_elements) ? d.portrait_elements : [])].some(
      (el) => el?.type === "qr" && el.target === "gallery",
    ),
  );
}

export async function magnetGuestState(db: ServiceClient, code: string): Promise<MagnetGuestState> {
  const range = MAGNET_GUEST_CODE_RE.test(code) ? magnetGuestRange(code) : null;
  if (!range) return { kind: "inactive", lang: "he" };

  // The one event whose id starts with the code's 16 hex digits (two would be a collision: no link).
  const { data: events } = await db
    .from("events")
    .select("id, photographer_id, client_lang")
    .gte("id", range.from)
    .lte("id", range.to)
    .limit(2)
    .returns<EventLite[]>();
  if (!events || events.length !== 1) return { kind: "inactive", lang: "he" };
  const event = events[0];

  const [{ data: designs }, { data: galleries }, { data: studio }] = await Promise.all([
    db
      .from("magnet_frame_designs")
      .select("landscape_elements, portrait_elements")
      .eq("event_id", event.id)
      .eq("photographer_id", event.photographer_id)
      .returns<DesignLite[]>(),
    db
      .from("galleries")
      .select("id, published, archived_at, created_at")
      .eq("event_id", event.id)
      .eq("photographer_id", event.photographer_id)
      .eq("is_portfolio_only", false)
      .order("created_at", { ascending: false })
      .returns<GalleryLite[]>(),
    db
      .from("photographers")
      .select("name, email, logo_storage_path, portfolio_slug, portfolio_enabled")
      .eq("id", event.photographer_id)
      .maybeSingle<StudioRow>(),
  ]);
  const lang = clientLangFor(studio?.email, event.client_lang);
  if (!hasGalleryQr(designs)) return { kind: "inactive", lang };

  const live = (galleries ?? []).find((g) => g.published && !g.archived_at);
  if (live) return { kind: "gallery", lang, galleryId: live.id };

  const studioInfo: MagnetGuestStudio = {
    name: studio?.name?.trim() ?? "",
    logoPath: studio?.logo_storage_path ?? null,
    portfolioSlug: magnetPortfolioSlug(studio),
  };
  const waiting = (galleries ?? []).some((g) => !g.archived_at);
  const archived = (galleries ?? []).some((g) => !!g.archived_at);
  return { kind: archived && !waiting ? "unavailable" : "soon", lang, studio: studioInfo };
}

// The guests' read-only link to the gallery (gallery_share_links, purpose 'magnet_guests',
// migration 0191): every tab, every photo, web quality. One per gallery, made on the first scan.
// Two first scans at the same moment: the unique index lets one insert through, and the other reads it.
export async function magnetGuestShareToken(db: ServiceClient, galleryId: string): Promise<string | null> {
  const find = async () =>
    (
      await db
        .from("gallery_share_links")
        .select("token")
        .eq("gallery_id", galleryId)
        .eq("purpose", "magnet_guests")
        .maybeSingle<{ token: string }>()
    ).data?.token ?? null;

  const existing = await find();
  if (existing) return existing;
  const { data: created, error } = await db
    .from("gallery_share_links")
    .insert({ gallery_id: galleryId, folder_keys: null, photo_ids: null, quality: "web", purpose: "magnet_guests" })
    .select("token")
    .single<{ token: string }>();
  if (created) return created.token;
  if (error?.code === "23505") return find();
  if (error) console.error("[m/code] share link insert failed", error.message);
  return null;
}
