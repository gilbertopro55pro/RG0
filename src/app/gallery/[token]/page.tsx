import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type {
  EventRow,
  GalleryAlbumCommentRow,
  GalleryAlbumRow,
  GalleryAlbumSpreadRow,
  GalleryFolderRow,
  GalleryPhotoRow,
  GalleryRow,
} from "@/lib/types";
import type { ClientAlbumElement } from "@/components/GalleryAlbumProofing";
import PublicGalleryView from "@/components/PublicGalleryView";
import GalleryCoverBanner from "@/components/GalleryCoverBanner";
import { getSignedDownloadUrls } from "@/lib/storage";
import { galleryThemeById, galleryThemeVars, galleryFont } from "@/lib/galleryTheme";
import type { GalleryStyleOverrides } from "@/lib/galleryTheme";

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

  // The album is only shown to the client once the photographer has sent it — a draft is a
  // photographer-only work-in-progress.
  const { data: album } = await supabase
    .from("gallery_albums")
    .select("*")
    .eq("gallery_id", gallery.id)
    .neq("status", "draft")
    .maybeSingle<GalleryAlbumRow>();

  let albumSpreadsForClient: {
    id: string;
    photo1: { id: string; url: string };
    photo2: { id: string; url: string } | null;
    layout: GalleryAlbumSpreadRow["layout"];
    focalX1: number;
    focalY1: number;
    focalX2: number;
    focalY2: number;
    elements: ClientAlbumElement[];
    comments: { id: string; text: string }[];
  }[] = [];
  let albumCoverUrl: string | null = null;
  if (album) {
    const [{ data: spreadsRaw }, { data: commentsRaw }] = await Promise.all([
      supabase
        .from("gallery_album_spreads")
        .select("*")
        .eq("album_id", album.id)
        .order("sort_order", { ascending: true })
        .returns<GalleryAlbumSpreadRow[]>(),
      supabase
        .from("gallery_album_comments")
        .select("*")
        .eq("album_id", album.id)
        .order("created_at", { ascending: true })
        .returns<GalleryAlbumCommentRow[]>(),
    ]);
    const photoById = new Map(photosWithUrls.map((p) => [p.id, p]));
    albumSpreadsForClient = (spreadsRaw ?? [])
      .map((s) => {
        const photo1 = photoById.get(s.photo_id_1);
        if (!photo1) return null;
        const photo2 = s.photo_id_2 ? photoById.get(s.photo_id_2) : null;
        const elements: ClientAlbumElement[] = s.elements
          .map((el): ClientAlbumElement | null => {
            if (el.type === "text") return el;
            const photo = photoById.get(el.photoId);
            if (!photo) return null;
            return { ...el, url: photo.url };
          })
          .filter((el): el is ClientAlbumElement => el !== null);
        return {
          id: s.id,
          photo1: { id: photo1.id, url: photo1.url },
          photo2: photo2 ? { id: photo2.id, url: photo2.url } : null,
          layout: s.layout,
          focalX1: s.focal_x_1,
          focalY1: s.focal_y_1,
          focalX2: s.focal_x_2,
          focalY2: s.focal_y_2,
          elements,
          comments: (commentsRaw ?? []).filter((c) => c.spread_id === s.id).map((c) => ({ id: c.id, text: c.text })),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
    const coverPhotoId = album.cover_photo_id ?? spreadsRaw?.[0]?.photo_id_1 ?? null;
    albumCoverUrl = (coverPhotoId ? photoById.get(coverPhotoId)?.url : null) ?? null;
  }

  const styleOverrides: GalleryStyleOverrides = {
    titleFontOverride: gallery.title_font_override,
    gridStyleOverride: gallery.grid_style_override,
  };
  const theme = galleryThemeById(gallery.theme);
  // Falls back to the first photo when the photographer hasn't explicitly chosen a cover — a
  // banner-less gallery reads as broken, and most galleries only ever need one obvious hero shot.
  const coverPhoto = (gallery.cover_photo_id ? photosWithUrls.find((p) => p.id === gallery.cover_photo_id) : null) ?? photosWithUrls[0];
  const dateLabel = event
    ? `${event.client_name} · ${new Date(event.event_date).toLocaleDateString("he-IL")}`
    : gallery.shoot_date
      ? new Date(gallery.shoot_date).toLocaleDateString("he-IL")
      : null;

  return (
    <div
      className={`${galleryFont.variable} max-w-2xl lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full min-h-screen`}
      style={{ background: theme.bg, ...galleryThemeVars(gallery.theme, styleOverrides) }}
    >
      <GalleryCoverBanner
        photoUrl={coverPhoto?.url ?? null}
        title={gallery.title}
        dateLabel={dateLabel}
        theme={gallery.theme}
        textPosition={gallery.cover_text_position}
        shape={gallery.cover_shape}
        titleFontOverride={gallery.title_font_override}
      />

      <PublicGalleryView
        token={token}
        initialPhotos={photosWithUrls}
        initialFolders={folders ?? []}
        initiallyConfirmed={!!gallery.selection_confirmed_at}
        allowDownloads={gallery.allow_downloads}
        themeId={gallery.theme}
        titleFontOverride={gallery.title_font_override}
        gridStyleOverride={gallery.grid_style_override}
        slideshowPhotoIds={gallery.slideshow_photo_ids}
        album={
          album && album.status !== "draft"
            ? { status: album.status as "sent" | "approved" | "changes_requested", title: album.title, coverUrl: albumCoverUrl }
            : null
        }
        albumSpreads={albumSpreadsForClient}
      />
    </div>
  );
}
