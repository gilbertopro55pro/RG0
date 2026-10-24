import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, GalleryPhotoRow, GalleryRow, Photographer } from "@/lib/types";
import GalleriesListView, { type GalleryListItem } from "@/components/GalleriesListView";
import { getPublicPreviewUrl, getSignedDownloadUrl } from "@/lib/storage";
import { hasAppAccess } from "@/lib/subscription";
import { clientLangFor } from "@/lib/clientLang";
import { GALLERIES_VIEW_COOKIE, parseGalleriesView, pickCoverPhoto } from "@/lib/galleriesView";

export default async function GalleriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: photographer }, { data: galleries }] = await Promise.all([
    supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>(),
    // Photos embedded directly instead of a second query keyed by gallery ids afterward.
    supabase
      .from("galleries")
      .select("*, events(client_name, event_date, client_lang), gallery_photos!gallery_photos_gallery_id_fkey(id, gallery_id, storage_path, sort_order)")
      .eq("is_portfolio_only", false)
      .eq("activated", true)
      .order("created_at", { ascending: false })
      .returns<
        (GalleryRow & {
          events: Pick<EventRow, "client_name" | "event_date" | "client_lang"> | null;
          gallery_photos: Pick<GalleryPhotoRow, "id" | "gallery_id" | "storage_path" | "sort_order">[];
        })[]
      >(),
  ]);
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  const photos = (galleries ?? []).flatMap((g) => g.gallery_photos);
  const coverByGallery = new Map((galleries ?? []).map((g) => [g.id, pickCoverPhoto(g.cover_photo_id, g.gallery_photos)]));

  // The covers' previews, in one query for just those photos: the cover shows whole, over a blurred
  // copy of itself (owner, 2026-10-24: the square crop cut them). The preview on the CDN has a stable
  // URL, so the image optimizer's resized copy is reused; the signed original changes every hour.
  const coverIds = [...coverByGallery.values()].flatMap((p) => (p ? [p.id] : []));
  const { data: coverPreviews } = coverIds.length
    ? await supabase
        .from("gallery_photos")
        .select("id, preview_storage_path, preview_blur_data_url, preview_aspect_ratio")
        .in("id", coverIds)
        .returns<Pick<GalleryPhotoRow, "id" | "preview_storage_path" | "preview_blur_data_url" | "preview_aspect_ratio">[]>()
    : { data: [] };
  const previewById = new Map((coverPreviews ?? []).map((p) => [p.id, p]));
  const view = parseGalleriesView((await cookies()).get(GALLERIES_VIEW_COOKIE)?.value);

  const items: GalleryListItem[] = await Promise.all(
    (galleries ?? []).map(async (gallery) => {
      const galleryPhotos = (photos ?? []).filter((p) => p.gallery_id === gallery.id);
      const coverPhoto = coverByGallery.get(gallery.id) ?? null;
      const preview = coverPhoto ? previewById.get(coverPhoto.id) : undefined;

      let coverUrl: string | null = null;
      if (preview?.preview_storage_path?.endsWith(".webp")) {
        coverUrl = getPublicPreviewUrl(preview.preview_storage_path);
      } else if (coverPhoto) {
        coverUrl = await getSignedDownloadUrl("galleries", coverPhoto.storage_path, 3600);
      }

      return {
        id: gallery.id,
        title: gallery.title,
        clientName: gallery.events?.client_name ?? "",
        eventDate: gallery.events?.event_date ?? null,
        photoCount: galleryPhotos.length,
        published: gallery.published,
        archived: !!gallery.archived_at,
        expiresAt: gallery.expires_at,
        permanentDeleteAt: gallery.permanent_delete_at,
        archiveReason: gallery.archive_reason,
        coverUrl,
        coverBlur: preview?.preview_blur_data_url ?? null,
        coverAspect: preview?.preview_aspect_ratio ?? null,
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
