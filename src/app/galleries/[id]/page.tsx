import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, GalleryFolderRow, GalleryPhotoRow, GalleryRow, Photographer } from "@/lib/types";
import GalleryManageView from "@/components/GalleryManageView";
import { getSignedDownloadUrl, getSignedDownloadUrls, getPublicPreviewUrl } from "@/lib/storage";
import { galleryBrandingAllowed } from "@/lib/galleryBranding";
import { fetchAllRowsCounted } from "@/lib/paginatedFetch";
import { hasAppAccess } from "@/lib/subscription";
import { clientLangFor } from "@/lib/clientLang";
import { photographerOriginalUrl } from "@/lib/galleryPhotoUrls";
import { trimBlurPlaceholders } from "@/lib/galleryBlurPlaceholders";

export default async function GalleryManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // gallery_photos is fetched as its own paginated query (see fetchAllRows's own comment) rather
  // than embedded on this select — an embedded relation is still subject to the same row cap as a
  // top-level query, and PostgREST has no `.range()` equivalent for an embedded resource via this
  // client, so a gallery with more photos than the cap would silently lose its own management view.
  // Its pages after the first come together (fetchAllRowsCounted), in a stable order (id breaks
  // sort_order ties). Events, folders and the photographer stay embedded — the photographer was a
  // query of its own after this one; same client, so the same RLS as before.
  const [{ data: gallery }, photosRaw] = await Promise.all([
    supabase
      .from("galleries")
      .select(
        "*, events(client_name, event_date, client_lang), gallery_folders(*), photographers(name, email, plan, subscription_status, trial_ends_at, logo_storage_path)"
      )
      .eq("id", id)
      .maybeSingle<
        GalleryRow & {
          events: Pick<EventRow, "client_name" | "event_date" | "client_lang"> | null;
          gallery_folders: GalleryFolderRow[];
          photographers: Pick<Photographer, "name" | "email" | "plan" | "subscription_status" | "trial_ends_at" | "logo_storage_path"> | null;
        }
      >(),
    fetchAllRowsCounted<GalleryPhotoRow>((from, to) =>
      supabase
        .from("gallery_photos")
        .select("*", { count: "exact" })
        .eq("gallery_id", id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<GalleryPhotoRow[]>()
    ),
  ]);
  if (!gallery) notFound();

  // Powers the WhatsApp share message wording (see buildShareMessage in GalleryManageView) — one
  // specific account gets its own personalized phrasing, everyone else gets a generic one signed
  // with their own name.
  const { photographers: photographer, ...galleryRow } = gallery;
  if (photographer && !hasAppAccess(photographer)) redirect("/billing");

  const event = gallery.events;
  const photos = [...photosRaw].sort((a, b) => a.sort_order - b.sort_order);
  const folders = [...gallery.gallery_folders].sort((a, b) => a.sort_order - b.sort_order);

  // `url` (the original) is a short same-origin route that signs the one photo that's opened, on
  // the click (lib/galleryPhotoUrls.ts, api/galleries/[id]/photos/[photoId]/original). Presigning
  // every original here took ~2.8 s and ~3 MB of page for the 5,382-photo gallery, and the screen
  // shows the previews anyway.
  // .webp previews live in the public CDN bucket — a stable, unsigned URL built directly, no round
  // trip needed. Older .jpg previews (from before that bucket existed, a handful) still need
  // signing. Either way the lightbox reads previewUrl directly with zero server hop on click,
  // instead of going through the /preview API route (DB lookup + redirect); that route still exists
  // and is used as a fallback only for photos that haven't been processed into a preview at all yet.
  // A big gallery keeps the blurred placeholders only for what shows first in each tab
  // (lib/galleryBlurPlaceholders.ts).
  let photosWithUrls: (GalleryPhotoRow & { url: string; previewUrl: string | null })[] = [];
  if (photos.length > 0) {
    const legacyPreviewPaths = photos.map((p) => p.preview_storage_path).filter((p): p is string => !!p && !p.endsWith(".webp"));
    const signedPreviews = legacyPreviewPaths.length > 0 ? await getSignedDownloadUrls("galleries", legacyPreviewPaths, 3600) : [];
    const signedPreviewUrlByPath = new Map(signedPreviews.map((s) => [s.path, s.signedUrl]));
    photosWithUrls = trimBlurPlaceholders(photos).map((p) => ({
      ...p,
      url: photographerOriginalUrl(id, p.id),
      previewUrl: p.preview_storage_path
        ? p.preview_storage_path.endsWith(".webp")
          ? getPublicPreviewUrl(p.preview_storage_path)
          : (signedPreviewUrlByPath.get(p.preview_storage_path) ?? null)
        : null,
    }));
  }

  // Same logo the client sees on the gallery (see gallery/[token]/page.tsx).
  const brandLogoUrl =
    photographer?.logo_storage_path && galleryBrandingAllowed(photographer)
      ? await getSignedDownloadUrl("logos", photographer.logo_storage_path, 3600)
      : null;

  // Full width: GalleryManageView lays out its own column, so the premium theme's cover and bar can
  // run edge to edge above it like on the client's page.
  return (
    <div className="w-full">
      <GalleryManageView
        brandLogoUrl={brandLogoUrl}
        eventId={gallery.event_id}
        clientName={event?.client_name ?? ""}
        eventDate={event?.event_date ?? null}
        initialGallery={galleryRow}
        initialPhotos={photosWithUrls}
        initialFolders={folders ?? []}
        photographerName={photographer?.name ?? ""}
        photographerEmail={photographer?.email ?? ""}
        photographerPlan={photographer?.plan ?? "monthly"}
        clientLang={clientLangFor(photographer?.email, event?.client_lang)}
      />
    </div>
  );
}
