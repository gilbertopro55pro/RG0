import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { EventRow, GalleryFolderRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";
import PublicGalleryView from "@/components/PublicGalleryView";
import GalleryCoverBanner from "@/components/GalleryCoverBanner";
import { getSignedDownloadUrls } from "@/lib/storage";
import { galleryThemeById, galleryThemeVars, galleryFont } from "@/lib/galleryTheme";

export default async function PublicGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ folders?: string }>;
}) {
  const { token } = await params;
  const { folders: foldersParam } = await searchParams;
  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .eq("published", true)
    .maybeSingle<GalleryRow>();

  if (!gallery) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
        <p className="text-sm text-ink-soft">הגלריה לא נמצאה, או שעדיין לא פורסמה.</p>
      </div>
    );
  }

  if (gallery.archived_at) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 pb-10 w-full text-center">
        <p className="text-sm text-ink-soft">הגלריה כבר לא זמינה. פנו לצלם/ת שלכם לפרטים נוספים.</p>
      </div>
    );
  }

  const [{ data: event }, { data: photosRaw }, { data: foldersRaw }] = await Promise.all([
    gallery.event_id
      ? supabase.from("events").select("client_name, event_date").eq("id", gallery.event_id).maybeSingle<Pick<EventRow, "client_name" | "event_date">>()
      : Promise.resolve({ data: null }),
    supabase
      .from("gallery_photos")
      .select("*")
      .eq("gallery_id", gallery.id)
      .order("sort_order", { ascending: true })
      .returns<GalleryPhotoRow[]>(),
    supabase
      .from("gallery_folders")
      .select("*")
      .eq("gallery_id", gallery.id)
      .order("sort_order", { ascending: true })
      .returns<GalleryFolderRow[]>(),
  ]);

  // A share link can restrict the visible tabs (see the share modal in GalleryManageView) —
  // filter folders/photos down before signing URLs, so excluded photos never even get a
  // signed URL generated or sent to the client.
  let folders = foldersRaw ?? [];
  let photos = photosRaw ?? [];
  if (foldersParam) {
    const selected = new Set(foldersParam.split(","));
    folders = folders.filter((f) => selected.has(f.id));
    photos = photos.filter((p) => (p.folder_id ? selected.has(p.folder_id) : selected.has("none")));
  }

  // One batched request for every signed URL instead of N individual round-trips — this was the
  // main reason gallery pages felt slow to load with a lot of photos. Downloads fetch their own
  // freshly-named signed URL on demand instead (see /api/gallery/[token]/download).
  let photosWithUrls: (GalleryPhotoRow & { url: string })[] = [];
  if (photos && photos.length > 0) {
    const signed = await getSignedDownloadUrls("galleries", photos.map((p) => p.storage_path), 3600);
    const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
    photosWithUrls = photos.map((p) => ({ ...p, url: urlByPath.get(p.storage_path) ?? "" }));
  }

  const theme = galleryThemeById(gallery.theme);
  const coverPhoto = gallery.cover_photo_id ? photosWithUrls.find((p) => p.id === gallery.cover_photo_id) : null;
  const dateLabel = event
    ? `${event.client_name} · ${new Date(event.event_date).toLocaleDateString("he-IL")}`
    : gallery.shoot_date
      ? new Date(gallery.shoot_date).toLocaleDateString("he-IL")
      : null;

  return (
    <div
      className={`${galleryFont.variable} max-w-2xl lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full min-h-screen`}
      style={{ background: theme.bg, ...galleryThemeVars(gallery.theme) }}
    >
      <GalleryCoverBanner
        photoUrl={coverPhoto?.url ?? null}
        title={gallery.title}
        dateLabel={dateLabel}
        theme={gallery.theme}
        textPosition={gallery.cover_text_position}
        shape={gallery.cover_shape}
      />

      <PublicGalleryView
        token={token}
        initialPhotos={photosWithUrls}
        initialFolders={folders ?? []}
        initiallyConfirmed={!!gallery.selection_confirmed_at}
        allowDownloads={gallery.allow_downloads}
        themeId={gallery.theme}
      />
    </div>
  );
}
