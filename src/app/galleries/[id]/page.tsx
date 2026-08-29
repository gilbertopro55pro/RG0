import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, GalleryFolderRow, GalleryPhotoRow, GalleryRow, Photographer } from "@/lib/types";
import GalleryManageView from "@/components/GalleryManageView";
import { getSignedDownloadUrls, getPublicPreviewUrl } from "@/lib/storage";

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

  // Powers the WhatsApp share message wording (see buildShareMessage in GalleryManageView) — one
  // specific account gets its own personalized phrasing, everyone else gets a generic one signed
  // with their own name.
  const { data: photographer } = await supabase
    .from("photographers")
    .select("name, email, plan")
    .eq("id", gallery.photographer_id)
    .maybeSingle<Pick<Photographer, "name" | "email" | "plan">>();

  const event = gallery.events;
  const photos = [...gallery.gallery_photos].sort((a, b) => a.sort_order - b.sort_order);
  const folders = [...gallery.gallery_folders].sort((a, b) => a.sort_order - b.sort_order);

  // One batched request for every signed URL instead of N individual round-trips — this was the
  // main reason gallery pages felt slow to load with a lot of photos.
  let photosWithUrls: (GalleryPhotoRow & { url: string; previewUrl: string | null })[] = [];
  if (photos && photos.length > 0) {
    const signed = await getSignedDownloadUrls("galleries", photos.map((p) => p.storage_path), 3600);
    const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
    // .webp previews live in the public CDN bucket — a stable, unsigned URL built directly, no
    // round trip needed. Older .jpg previews (from before that bucket existed) still need signing.
    // Either way the lightbox reads previewUrl directly with zero server hop on click, instead of
    // going through the /preview API route (DB lookup + redirect); that route still exists and is
    // used as a fallback only for photos that haven't been processed into a preview at all yet.
    const legacyPreviewPaths = photos.map((p) => p.preview_storage_path).filter((p): p is string => !!p && !p.endsWith(".webp"));
    const signedPreviews = legacyPreviewPaths.length > 0 ? await getSignedDownloadUrls("galleries", legacyPreviewPaths, 3600) : [];
    const signedPreviewUrlByPath = new Map(signedPreviews.map((s) => [s.path, s.signedUrl]));
    photosWithUrls = photos.map((p) => ({
      ...p,
      url: urlByPath.get(p.storage_path) ?? "",
      previewUrl: p.preview_storage_path
        ? p.preview_storage_path.endsWith(".webp")
          ? getPublicPreviewUrl(p.preview_storage_path)
          : (signedPreviewUrlByPath.get(p.preview_storage_path) ?? null)
        : null,
    }));
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
        photographerName={photographer?.name ?? ""}
        photographerEmail={photographer?.email ?? ""}
        photographerPlan={photographer?.plan ?? "monthly"}
      />
    </div>
  );
}
