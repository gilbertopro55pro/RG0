import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { getPublicPreviewUrl, getSignedDownloadUrls } from "@/lib/storage";
import { photographerOriginalUrl } from "@/lib/galleryPhotoUrls";
import type { CorrectionPage } from "@/lib/albumCorrections";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow } from "@/lib/types";
import { getLang, getT } from "@/i18n/server";
import { dateLocale } from "@/i18n/config";
import AlbumCorrectionsView, { type CorrectedPageView } from "@/components/AlbumCorrectionsView";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CorrectionRow = { id: string; album_id: string; gallery_id: string; pages: CorrectionPage[]; created_at: string; seen_at: string | null };

// The client's corrections on the album design (owner, 2026-10-27; lib/albumCorrections.ts), from
// the short link in the photographer's email and phone notification: each page the client marked,
// drawn as in the album tool, with the marks over it and the client's note.
export default async function AlbumCorrectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  // RLS: only the photographer's own submissions.
  const { data: correction } = await supabase
    .from("gallery_album_corrections")
    .select("id, album_id, gallery_id, pages, created_at, seen_at")
    .eq("id", id)
    .maybeSingle<CorrectionRow>();
  if (!correction) notFound();

  const [{ data: album }, { data: gallery }, { data: spreadsRaw }, { data: latest }] = await Promise.all([
    supabase.from("gallery_albums").select("*").eq("id", correction.album_id).maybeSingle<GalleryAlbumRow>(),
    supabase.from("galleries").select("id, title, events(client_name)").eq("id", correction.gallery_id).maybeSingle<{ id: string; title: string | null; events: { client_name: string | null } | null }>(),
    supabase.from("gallery_album_spreads").select("*").eq("album_id", correction.album_id).order("sort_order", { ascending: true }).returns<GalleryAlbumSpreadRow[]>(),
    supabase
      .from("gallery_album_corrections")
      .select("id")
      .eq("album_id", correction.album_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>(),
  ]);
  if (!album || !gallery) notFound();

  const spreads = spreadsRaw ?? [];
  const pageById = new Map(correction.pages.map((p) => [p.spreadId, p]));
  const marked = spreads.map((s, i) => ({ spread: s, number: i + 1, page: pageById.get(s.id) })).filter((x) => !!x.page);

  // The photos those pages show, by their screen-sized previews (never the originals).
  const photoIds = new Set<string>();
  const ornamentIds = new Set<string>();
  for (const { spread } of marked) {
    for (const pid of [spread.photo_id_1, spread.photo_id_2, spread.background_photo_id]) if (pid) photoIds.add(pid);
    for (const el of spread.elements) {
      if (el.type === "photo" && el.photoId) photoIds.add(el.photoId);
      if (el.type === "ornament" && el.customOrnamentId) ornamentIds.add(el.customOrnamentId);
    }
  }
  const [{ data: photoRows }, { data: ornamentRows }] = await Promise.all([
    photoIds.size
      ? supabase.from("gallery_photos").select("id, preview_storage_path").in("id", [...photoIds]).returns<{ id: string; preview_storage_path: string | null }[]>()
      : Promise.resolve({ data: [] as { id: string; preview_storage_path: string | null }[] }),
    ornamentIds.size
      ? supabase.from("custom_ornaments").select("id, storage_path").in("id", [...ornamentIds]).returns<{ id: string; storage_path: string }[]>()
      : Promise.resolve({ data: [] as { id: string; storage_path: string }[] }),
  ]);
  const legacyPaths = (photoRows ?? []).map((p) => p.preview_storage_path).filter((p): p is string => !!p && !p.endsWith(".webp"));
  const [signedPreviews, signedOrnaments] = await Promise.all([
    legacyPaths.length ? getSignedDownloadUrls("galleries", legacyPaths, 3600) : Promise.resolve([]),
    (ornamentRows ?? []).length ? getSignedDownloadUrls("custom-ornaments", (ornamentRows ?? []).map((o) => o.storage_path), 3600) : Promise.resolve([]),
  ]);
  const signedPreviewByPath = new Map(signedPreviews.map((s) => [s.path, s.signedUrl]));
  const photos = (photoRows ?? []).map((p) => ({
    id: p.id,
    url: photographerOriginalUrl(gallery.id, p.id),
    previewUrl: p.preview_storage_path
      ? p.preview_storage_path.endsWith(".webp")
        ? getPublicPreviewUrl(p.preview_storage_path)
        : (signedPreviewByPath.get(p.preview_storage_path) ?? null)
      : null,
  }));
  const ornamentUrlByPath = new Map(signedOrnaments.map((s) => [s.path, s.signedUrl]));
  const customOrnaments = (ornamentRows ?? []).flatMap((o) => {
    const url = ornamentUrlByPath.get(o.storage_path);
    return url ? [{ id: o.id, url }] : [];
  });

  // Seen: the album tool can tell new corrections from ones already looked at.
  if (!correction.seen_at) {
    after(async () => {
      await createServiceRoleClient().from("gallery_album_corrections").update({ seen_at: new Date().toISOString() }).eq("id", correction.id).is("seen_at", null);
    });
  }

  const t = await getT();
  const lang = await getLang();
  const name = gallery.events?.client_name?.trim() || gallery.title?.trim() || t("האלבום");
  const pages: CorrectedPageView[] = marked.map(({ spread, number, page }) => ({
    spread,
    number,
    note: page?.note ?? null,
    marks: page?.marks ?? [],
    size: { width_cm: Number(spread.width_cm ?? album.width_cm), height_cm: Number(spread.height_cm ?? album.height_cm) },
  }));

  return (
    <AlbumCorrectionsView
      title={t("תיקונים מהלקוח · {name}", { name })}
      sentAt={new Date(correction.created_at).toLocaleString(dateLocale(lang), {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jerusalem",
      })}
      isLatest={latest?.id === correction.id}
      albumStatus={album.status}
      editHref={`/galleries/${gallery.id}?openAlbum=1`}
      pages={pages}
      photos={photos}
      customOrnaments={customOrnaments}
    />
  );
}
