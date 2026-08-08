import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { EventRow, GalleryFolderRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";
import PublicGalleryView from "@/components/PublicGalleryView";

export default async function PublicGalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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

  const [{ data: event }, { data: photos }, { data: folders }] = await Promise.all([
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

  // One batched request for every signed URL instead of N individual round-trips — this was the
  // main reason gallery pages felt slow to load with a lot of photos. Downloads fetch their own
  // freshly-named signed URL on demand instead (see /api/gallery/[token]/download).
  let photosWithUrls: (GalleryPhotoRow & { url: string })[] = [];
  if (photos && photos.length > 0) {
    const { data: signed } = await supabase.storage
      .from("galleries")
      .createSignedUrls(photos.map((p) => p.storage_path), 3600);
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    photosWithUrls = photos.map((p) => ({ ...p, url: urlByPath.get(p.storage_path) ?? "" }));
  }

  return (
    <div className="max-w-2xl lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <h1 className="text-[22px] font-bold mb-1 font-display">{gallery.title}</h1>
      {event ? (
        <p className="text-xs mb-5 text-ink-soft">
          {event.client_name} · {new Date(event.event_date).toLocaleDateString("he-IL")}
        </p>
      ) : (
        gallery.shoot_date && (
          <p className="text-xs mb-5 text-ink-soft">{new Date(gallery.shoot_date).toLocaleDateString("he-IL")}</p>
        )
      )}

      <PublicGalleryView
        token={token}
        initialPhotos={photosWithUrls}
        initialFolders={folders ?? []}
        initiallyConfirmed={!!gallery.selection_confirmed_at}
        allowDownloads={gallery.allow_downloads}
      />
    </div>
  );
}
