import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createClient } from "@/lib/supabase/server";
import type {
  EventRow,
  GalleryAlbumCommentRow,
  GalleryAlbumRow,
  GalleryAlbumSpreadRow,
  GalleryFolderRow,
  GalleryPhotoRow,
  GalleryRow,
  Photographer,
} from "@/lib/types";
import type { ClientAlbumElement } from "@/components/GalleryAlbumProofing";
import PublicGalleryView from "@/components/PublicGalleryView";
import GalleryCoverBanner from "@/components/GalleryCoverBanner";
import { getSignedDownloadUrl, getSignedDownloadUrls, getPublicPreviewUrl } from "@/lib/storage";
import { galleryThemeById, galleryThemeVars, galleryFont } from "@/lib/galleryTheme";
import type { GalleryStyleOverrides } from "@/lib/galleryTheme";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import { isLightTextColor } from "@/lib/textColor";

// Powers the link-preview card WhatsApp/iMessage/etc. show when a photographer sends the gallery
// link to a client — without this, every gallery link previewed with the same generic app icon
// (the site-wide default in layout.tsx), giving the client zero visual cue of which gallery it is.
// Runs as a second, lightweight query independent of the page body below (metadata generation and
// the page component are fetched in parallel by Next, not sequentially) rather than reusing that
// query's result, since generateMetadata has no access to it.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const supabase = createServiceRoleClient();
  const { data: gallery } = await supabase.from("galleries").select("*").eq("access_token", token).maybeSingle<GalleryRow>();
  // Unpublished galleries render "not found" to anyone but their own owner (see the page body
  // below) — matching that here so a link preview never leaks a photo from a gallery the client
  // isn't actually supposed to be able to see yet.
  if (!gallery || !gallery.published || gallery.archived_at) return {};

  let imageUrl: string | null = null;
  if (gallery.cover_photo_id) {
    const { data: photo } = await supabase
      .from("gallery_photos")
      .select("storage_path, preview_storage_path")
      .eq("id", gallery.cover_photo_id)
      .maybeSingle<Pick<GalleryPhotoRow, "storage_path" | "preview_storage_path">>();
    if (photo?.preview_storage_path?.endsWith(".webp")) {
      // Stable, non-expiring public URL — safe for a crawler to cache indefinitely.
      imageUrl = getPublicPreviewUrl(photo.preview_storage_path);
    } else if (photo) {
      // Legacy (pre-public-preview) photo: no stable public URL exists yet, so fall back to a
      // long-lived signed one — not perfectly permanent, but far better than the 1-hour links used
      // elsewhere on this page, which would break a crawler's cached preview almost immediately.
      imageUrl = await getSignedDownloadUrl("galleries", photo.storage_path, 60 * 60 * 24 * 7);
    }
  }

  const title = gallery.title || "גלריית תמונות";
  const description = "צפו וסמנו את התמונות הנבחרות שלכם מתוך הגלריה";
  return {
    title,
    openGraph: {
      title,
      description,
      siteName: "גילברטו",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function PublicGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ folders?: string; photos?: string; quality?: string }>;
}) {
  const { token } = await params;
  const { folders: foldersParam, photos: photosParam, quality: qualityParam } = await searchParams;
  const restrictedQuality = qualityParam === "web" ? "web" : null;
  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .maybeSingle<GalleryRow>();

  // Published galleries are open to anyone with the link, as always. An unpublished one is only
  // shown if the requester is authenticated as the gallery's own photographer — lets them preview
  // exactly what the client will eventually see, on the same URL the client will get, without
  // opening the gallery up to anyone else before it's actually published.
  let isOwnerPreview = false;
  if (gallery && !gallery.published) {
    const authedSupabase = await createClient();
    const {
      data: { user },
    } = await authedSupabase.auth.getUser();
    isOwnerPreview = !!user && user.id === gallery.photographer_id;
  }

  if (!gallery || (!gallery.published && !isOwnerPreview)) {
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

  const [{ data: event }, { data: photosRaw }, { data: foldersRaw }, { data: brandingPhotographer }, { data: videosRaw }] = await Promise.all([
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
    // Studio Pro's "full branding" perk — see BrandingSettings.tsx and the render below.
    supabase
      .from("photographers")
      .select("plan, brand_color, logo_storage_path")
      .eq("id", gallery.photographer_id)
      .maybeSingle<Pick<Photographer, "plan" | "brand_color" | "logo_storage_path">>(),
    supabase
      .from("gallery_videos")
      .select("id, original_filename, storage_path")
      .eq("gallery_id", gallery.id)
      .order("sort_order", { ascending: true })
      .returns<{ id: string; original_filename: string; storage_path: string }[]>(),
  ]);

  // A share link can restrict the visible tabs or an exact set of photos (see the share modals in
  // GalleryManageView and PublicGalleryView) — filter folders/photos down before signing URLs, so
  // excluded photos never even get a signed URL generated or sent to the client.
  let folders = foldersRaw ?? [];
  let photos = photosRaw ?? [];
  if (foldersParam) {
    const selected = new Set(foldersParam.split(","));
    folders = folders.filter((f) => selected.has(f.id));
    photos = photos.filter((p) => (p.folder_id ? selected.has(p.folder_id) : selected.has("none")));
  } else if (photosParam) {
    // A curated one-off set of specific photos (e.g. "share just these 4") — the folder tab bar
    // makes no sense on a link like this, so it's dropped entirely rather than left showing tabs
    // that mostly filter down to nothing.
    const selectedIds = new Set(photosParam.split(","));
    photos = photos.filter((p) => selectedIds.has(p.id));
    folders = [];
  }
  // Rejected photos never reach a client, whether they're browsing normally or the photographer
  // is previewing the exact link the client will see — culling is meant to happen before this
  // page is ever visited, not after.
  photos = photos.filter((p) => p.culling_status !== "rejected");

  // One batched request for every signed URL instead of N individual round-trips — this was the
  // main reason gallery pages felt slow to load with a lot of photos. Downloads fetch their own
  // freshly-named signed URL on demand instead (see /api/gallery/[token]/download).
  let photosWithUrls: (GalleryPhotoRow & { url: string; previewUrl: string | null })[] = [];
  if (photos && photos.length > 0) {
    const signed = await getSignedDownloadUrls("galleries", photos.map((p) => p.storage_path), 3600);
    const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
    // .webp previews live in the public CDN bucket — a stable, unsigned URL built directly, no
    // round trip needed. Older .jpg previews (from before that bucket existed) still need signing.
    // Either way the lightbox reads previewUrl directly with zero server hop on click, instead of
    // going through the /preview API route (DB lookup + redirect); that route is still the fallback
    // for any photo that hasn't been processed into a preview at all yet.
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

  const videosWithUrls =
    videosRaw && videosRaw.length > 0
      ? await Promise.all(
          videosRaw.map(async (v) => ({ id: v.id, name: v.original_filename, url: await getSignedDownloadUrl("galleries", v.storage_path, 3600) }))
        )
      : [];

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
    background: { url: string; blur: number; opacity: number } | null;
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

    // Custom (uploaded) ornaments have no public URL of their own — resolved here the same way
    // photos are (a batch of signed URLs against R2), since the client viewing this page has no
    // auth session at all to hit the bearer-only /api/desktop/ornaments route with.
    const customOrnamentIds = new Set<string>();
    for (const s of spreadsRaw ?? []) {
      for (const el of s.elements) {
        if (el.type === "ornament" && el.customOrnamentId) customOrnamentIds.add(el.customOrnamentId);
      }
    }
    const customOrnamentUrlById = new Map<string, string>();
    if (customOrnamentIds.size > 0) {
      const { data: customOrnamentRows } = await supabase
        .from("custom_ornaments")
        .select("id, storage_path")
        .in("id", Array.from(customOrnamentIds))
        .returns<{ id: string; storage_path: string }[]>();
      if (customOrnamentRows && customOrnamentRows.length > 0) {
        const signed = await getSignedDownloadUrls("custom-ornaments", customOrnamentRows.map((r) => r.storage_path), 3600);
        const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
        for (const row of customOrnamentRows) {
          const url = urlByPath.get(row.storage_path);
          if (url) customOrnamentUrlById.set(row.id, url);
        }
      }
    }

    albumSpreadsForClient = (spreadsRaw ?? [])
      .map((s) => {
        const photo1 = photoById.get(s.photo_id_1);
        if (!photo1) return null;
        const photo2 = s.photo_id_2 ? photoById.get(s.photo_id_2) : null;
        const elements: ClientAlbumElement[] = s.elements
          .map((el): ClientAlbumElement | null => {
            if (el.type === "text") return el;
            if (el.type === "shape") return el;
            if (el.type === "ornament") {
              return {
                id: el.id,
                type: "ornament",
                ornamentId: el.ornamentId,
                customUrl: el.customOrnamentId ? customOrnamentUrlById.get(el.customOrnamentId) : undefined,
                xPct: el.xPct,
                yPct: el.yPct,
                widthPct: el.widthPct,
                heightPct: el.heightPct,
                color: el.color,
                rotation: el.rotation,
                opacity: el.opacity,
              };
            }
            // An empty frame (no photo assigned yet) never reaches the client — it's a
            // photographer-only work-in-progress placeholder.
            if (!el.photoId) return null;
            const photo = photoById.get(el.photoId);
            if (!photo) return null;
            return { ...el, url: photo.url };
          })
          .filter((el): el is ClientAlbumElement => el !== null);
        const backgroundPhoto = s.background_photo_id ? photoById.get(s.background_photo_id) : null;
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
          background: backgroundPhoto ? { url: backgroundPhoto.url, blur: s.background_blur, opacity: s.background_opacity } : null,
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

  // Studio Pro's "full branding" perk — see BrandingSettings.tsx. A photographer's own accent
  // color and logo carry across every gallery theme instead of each theme's built-in accent, but
  // only for photographers actually on that tier (a downgrade silently reverts to the theme
  // default rather than leaving a stale color behind).
  const isBrandingPro = brandingPhotographer ? SUBSCRIPTION_PLANS[brandingPhotographer.plan].tier === "studio_pro" : false;
  const brandColor = isBrandingPro ? brandingPhotographer?.brand_color ?? null : null;
  const brandAccentVars = brandColor
    ? { "--gt-accent": brandColor, "--gt-accent-ink": isLightTextColor(brandColor) ? "#000000" : "#ffffff" }
    : {};
  const brandLogoUrl =
    isBrandingPro && brandingPhotographer?.logo_storage_path
      ? await getSignedDownloadUrl("logos", brandingPhotographer.logo_storage_path, 3600)
      : null;
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
      style={{ background: theme.bg, ...galleryThemeVars(gallery.theme, styleOverrides), ...brandAccentVars }}
    >
      {isOwnerPreview && (
        <div className="sticky top-0 z-50 -mx-4 mb-3 px-4 py-2 text-center text-xs font-semibold text-white" style={{ background: "var(--color-amber-deep)" }}>
          תצוגה מקדימה — כך הלקוח/ה יראו את הגלריה לאחר הפרסום. הגלריה עצמה עדיין לא פורסמה.
        </div>
      )}
      {brandLogoUrl && (
        <div className="flex justify-center pt-1 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brandLogoUrl} alt="" className="h-10 w-auto object-contain" />
        </div>
      )}
      <GalleryCoverBanner
        photoUrl={coverPhoto?.url ?? null}
        title={gallery.title}
        dateLabel={dateLabel}
        theme={gallery.theme}
        textPosition={gallery.cover_text_position}
        shape={gallery.cover_shape}
        titleFontOverride={gallery.title_font_override}
      />

      {videosWithUrls.length > 0 && (
        <div className="mb-6 space-y-3">
          {videosWithUrls.map((v) => (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video key={v.id} src={v.url} controls playsInline className="w-full rounded-2xl block" style={{ background: "#000" }} />
          ))}
        </div>
      )}

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
        restrictedQuality={restrictedQuality}
      />
    </div>
  );
}
