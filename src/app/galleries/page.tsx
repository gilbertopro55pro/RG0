import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import type { EventRow, GalleryPhotoRow, GalleryRow, Photographer } from "@/lib/types";
import GalleriesListView, { type GalleryListItem } from "@/components/GalleriesListView";
import { getPublicPreviewUrl, getSignedDownloadUrl } from "@/lib/storage";
import { hasAppAccess } from "@/lib/subscription";
import { clientLangFor } from "@/lib/clientLang";
import { GALLERIES_VIEW_COOKIE, parseGalleriesView, pickCoverPhoto } from "@/lib/galleriesView";

export default async function GalleriesPage() {
  const supabase = await createClient();
  const user = await getSessionUser();

  // Per gallery, only its photo count and its cover: the chosen photo through its own key, and the
  // first photo by order (an embed limited per gallery) as the fallback. Every photo row of every
  // gallery used to come back here just to be counted — 23k rows for the largest account, on every
  // visit to this page — and the covers' previews were a second query after it. The cover shows
  // whole, over a blurred copy of itself (owner, 2026-10-24: the square crop cut them). The preview
  // on the CDN has a stable URL, so the image optimizer's resized copy is reused; the signed
  // original changes every hour.
  const COVER_COLUMNS = "id, gallery_id, storage_path, sort_order, preview_storage_path, preview_blur_data_url, preview_aspect_ratio";
  type CoverPhoto = Pick<
    GalleryPhotoRow,
    "id" | "gallery_id" | "storage_path" | "sort_order" | "preview_storage_path" | "preview_blur_data_url" | "preview_aspect_ratio"
  >;
  const [{ data: photographer }, { data: galleries }] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    supabase
      .from("galleries")
      .select(
        `*, events(client_name, event_date, client_lang), photo_count:gallery_photos!gallery_photos_gallery_id_fkey(count), cover:gallery_photos!galleries_cover_photo_fk(${COVER_COLUMNS}), first_photo:gallery_photos!gallery_photos_gallery_id_fkey(${COVER_COLUMNS})`
      )
      .eq("is_portfolio_only", false)
      .eq("activated", true)
      .order("created_at", { ascending: false })
      .order("sort_order", { referencedTable: "first_photo", ascending: true, nullsFirst: false })
      .limit(1, { referencedTable: "first_photo" })
      .returns<
        (GalleryRow & {
          events: Pick<EventRow, "client_name" | "event_date" | "client_lang"> | null;
          photo_count: { count: number }[];
          cover: CoverPhoto | null;
          first_photo: CoverPhoto[];
        })[]
      >(),
  ]);
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  const view = parseGalleriesView((await cookies()).get(GALLERIES_VIEW_COOKIE)?.value);

  const items: GalleryListItem[] = await Promise.all(
    (galleries ?? []).map(async (gallery) => {
      const cover = pickCoverPhoto(
        gallery.cover_photo_id,
        [gallery.cover, ...gallery.first_photo].filter((p): p is CoverPhoto => !!p && p.gallery_id === gallery.id)
      );

      let coverUrl: string | null = null;
      if (cover?.preview_storage_path?.endsWith(".webp")) {
        coverUrl = getPublicPreviewUrl(cover.preview_storage_path);
      } else if (cover) {
        coverUrl = await getSignedDownloadUrl("galleries", cover.storage_path, 3600);
      }

      return {
        id: gallery.id,
        title: gallery.title,
        clientName: gallery.events?.client_name ?? "",
        eventDate: gallery.events?.event_date ?? null,
        photoCount: gallery.photo_count[0]?.count ?? 0,
        published: gallery.published,
        archived: !!gallery.archived_at,
        expiresAt: gallery.expires_at,
        permanentDeleteAt: gallery.permanent_delete_at,
        archiveReason: gallery.archive_reason,
        coverUrl,
        coverBlur: cover?.preview_blur_data_url ?? null,
        coverAspect: cover?.preview_aspect_ratio ?? null,
        accessToken: gallery.access_token,
        expiryDays: gallery.expiry_days,
        restoredOnce: gallery.restored_once,
        clientLang: clientLangFor(photographer.email, gallery.events?.client_lang),
      };
    })
  );

  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <GalleriesListView items={items} initialView={view} photographerName={photographer.name} photographerEmail={photographer.email} />
    </div>
  );
}
