import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, GalleryFolderRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";
import GalleryManageView from "@/components/GalleryManageView";
import { getSignedDownloadUrls } from "@/lib/storage";

export default async function GalleryManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Event, photos and folders all embedded on the single galleries query (one round trip) instead
  // of fetching the gallery first and then a further parallel batch keyed off its id/event_id.
  const { data: gallery } = await supabase
    .from("galleries")
    .select("*, events(client_name, event_date), gallery_photos!gallery_photos_gallery_id_fkey(*), gallery_folders(*)")
    .eq("id", id)
    .maybeSingle<
      GalleryRow & {
        events: Pick<EventRow, "client_name" | "event_date"> | null;
        gallery_photos: GalleryPhotoRow[];
        gallery_folders: GalleryFolderRow[];
      }
    >();
  if (!gallery) notFound();

  const event = gallery.events;
  const photos = [...gallery.gallery_photos].sort((a, b) => a.sort_order - b.sort_order);
  const folders = [...gallery.gallery_folders].sort((a, b) => a.sort_order - b.sort_order);

  // One batched request for every signed URL instead of N individual round-trips — this was the
  // main reason gallery pages felt slow to load with a lot of photos.
  let photosWithUrls: (GalleryPhotoRow & { url: string })[] = [];
  if (photos && photos.length > 0) {
    const signed = await getSignedDownloadUrls("galleries", photos.map((p) => p.storage_path), 3600);
    const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
    photosWithUrls = photos.map((p) => ({ ...p, url: urlByPath.get(p.storage_path) ?? "" }));
  }

  return (
    <div className="max-w-2xl lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <GalleryManageView
        eventId={gallery.event_id}
        clientName={event?.client_name ?? ""}
        eventDate={event?.event_date ?? null}
        initialGallery={gallery}
        initialPhotos={photosWithUrls}
        initialFolders={folders ?? []}
      />
    </div>
  );
}
