import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, GalleryPhotoRow, GalleryRow, Photographer } from "@/lib/types";
import GalleriesListView, { type GalleryListItem } from "@/components/GalleriesListView";
import { getSignedDownloadUrl } from "@/lib/storage";
import { hasAppAccess } from "@/lib/subscription";

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
      .select("*, events(client_name, event_date), gallery_photos!gallery_photos_gallery_id_fkey(id, gallery_id, storage_path, sort_order)")
      .eq("is_portfolio_only", false)
      .eq("activated", true)
      .order("created_at", { ascending: false })
      .returns<
        (GalleryRow & {
          events: Pick<EventRow, "client_name" | "event_date"> | null;
          gallery_photos: Pick<GalleryPhotoRow, "id" | "gallery_id" | "storage_path" | "sort_order">[];
        })[]
      >(),
  ]);
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");

  const photos = (galleries ?? []).flatMap((g) => g.gallery_photos);

  const items: GalleryListItem[] = await Promise.all(
    (galleries ?? []).map(async (gallery) => {
      const galleryPhotos = (photos ?? []).filter((p) => p.gallery_id === gallery.id);
      const coverPhoto = gallery.cover_photo_id
        ? galleryPhotos.find((p) => p.id === gallery.cover_photo_id) ?? galleryPhotos[0]
        : galleryPhotos[0];

      let coverUrl: string | null = null;
      if (coverPhoto) {
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
        accessToken: gallery.access_token,
        expiryDays: gallery.expiry_days,
        restoredOnce: gallery.restored_once,
      };
    })
  );

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <GalleriesListView items={items} photographerName={photographer.name} photographerEmail={photographer.email} />
    </div>
  );
}
