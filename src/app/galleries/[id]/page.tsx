import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, GalleryFolderRow, GalleryPhotoRow, GalleryRow, Photographer } from "@/lib/types";
import GalleryManageView from "@/components/GalleryManageView";
import { getSignedDownloadUrls, getPublicPreviewUrl } from "@/lib/storage";
import { fetchAllRows } from "@/lib/paginatedFetch";

export default async function GalleryManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // gallery_photos is fetched as its own paginated query (see fetchAllRows's own comment) rather
  // than embedded on this select — an embedded relation is still subject to the same row cap as a
  // top-level query, and PostgREST has no `.range()` equivalent for an embedded resource via this
  // client, so a gallery with more photos than the cap would silently lose its own management view.
  // Events/folders stay embedded — neither ever approaches that row count.
  const [{ data: gallery }, photosRaw] = await Promise.all([
    supabase
      .from("galleries")
      .select("*, events(client_name, event_date), gallery_folders(*)")
      .eq("id", id)
      .maybeSingle<
        GalleryRow & {
          events: Pick<EventRow, "client_name" | "event_date"> | null;
          gallery_folders: GalleryFolderRow[];
        }
      >(),
    fetchAllRows<GalleryPhotoRow>((from, to) =>
      supabase.from("gallery_photos").select("*").eq("gallery_id", id).range(from, to).returns<GalleryPhotoRow[]>()
    ),
  ]);
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
  const photos = [...photosRaw].sort((a, b) => a.sort_order - b.sort_order);
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
