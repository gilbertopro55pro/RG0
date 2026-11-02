import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { getPublicPreviewUrl, getSignedDownloadUrls } from "@/lib/storage";
import { photographerOriginalUrl } from "@/lib/galleryPhotoUrls";
import { correctionRounds, mergeCorrectionPages, orderCorrectionPages, type CorrectionPage, type CorrectionRound } from "@/lib/albumCorrections";
import { loadAlbumCorrections, type CorrectionSubmissionRow } from "@/lib/albumCorrectionRounds";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow } from "@/lib/types";
import { getLang, getT } from "@/i18n/server";
import { dateLocale } from "@/i18n/config";
import AlbumCorrectionsView, { type CorrectedPageView, type CorrectionRoundLink } from "@/components/AlbumCorrectionsView";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CorrectionRow = {
  id: string;
  album_id: string;
  gallery_id: string;
  pages: CorrectionPage[];
  created_at: string;
  seen_at: string | null;
  galleries: { id: string; title: string | null; event_id: string | null; events: { client_name: string | null } | null } | null;
};

// The client's corrections on the album design (owner, 2026-10-27; lib/albumCorrections.ts), from
// the short link in the photographer's email and phone notification: each page the client marked,
// drawn as in the album tool, with the marks over it and the client's notes.
//
// The whole round the link's submission belongs to (owner, 2026-11-02, "תיקון"): the client sends
// corrections in parts (4 pages, and a few minutes later one more), and the page showed only the
// part in the link. Now every page they sent since the design was last sent, with every note.
export default async function AlbumCorrectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  // RLS: only the photographer's own submissions.
  const { data: correction } = await supabase
    .from("gallery_album_corrections")
    .select("id, album_id, gallery_id, pages, created_at, seen_at, galleries(id, title, event_id, events(client_name))")
    .eq("id", id)
    .maybeSingle<CorrectionRow>();
  if (!correction || !correction.galleries) notFound();
  const gallery = correction.galleries;

  const [{ data: album }, { data: spreadsRaw }, { submissions, sendTimes }] = await Promise.all([
    supabase.from("gallery_albums").select("*").eq("id", correction.album_id).maybeSingle<GalleryAlbumRow>(),
    supabase.from("gallery_album_spreads").select("*").eq("album_id", correction.album_id).order("sort_order", { ascending: true }).returns<GalleryAlbumSpreadRow[]>(),
    loadAlbumCorrections(supabase, correction.album_id, gallery.event_id),
  ]);
  if (!album) notFound();

  const spreads = spreadsRaw ?? [];
  const rounds = correctionRounds(submissions, sendTimes, album);
  const fallback: CorrectionRound<CorrectionSubmissionRow> = { sentAt: null, submissions: [correction], open: false };
  const round = rounds.find((r) => r.submissions.some((s) => s.id === correction.id)) ?? fallback;
  const merged = orderCorrectionPages(
    mergeCorrectionPages(round.submissions),
    spreads.map((s) => s.id)
  );
  const spreadById = new Map(spreads.map((s) => [s.id, s]));
  const marked = merged.map((page) => ({ spread: spreadById.get(page.spreadId)!, number: page.number, page }));

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
  const unseen = round.submissions.filter((s) => !s.seen_at).map((s) => s.id);
  if (unseen.length) {
    after(async () => {
      await createServiceRoleClient().from("gallery_album_corrections").update({ seen_at: new Date().toISOString() }).in("id", unseen).is("seen_at", null);
    });
  }

  const t = await getT();
  const lang = await getLang();
  const when = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale(lang), {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jerusalem",
    });
  const name = gallery.events?.client_name?.trim() || gallery.title?.trim() || t("האלבום");
  const parts = round.submissions.length;
  const pages: CorrectedPageView[] = marked.map(({ spread, number, page }) => ({
    spread,
    number,
    // The time of each note only when the round came in more than one part.
    notes: page.notes.map((n) => ({ text: n.text, at: parts > 1 ? when(n.at) : null })),
    marks: page.marks,
    size: { width_cm: Number(spread.width_cm ?? album.width_cm), height_cm: Number(spread.height_cm ?? album.height_cm) },
  }));

  // The admin's additions (owner, 2026-11-02, "עדכון אדמין"): every round of corrections, to come
  // back to, and "לעריכת האלבום" opens the editor on the first corrected page with the corrections
  // beside it (GalleryManageView, AlbumCorrectionsPanel).
  const isAdmin = user.email === ADMIN_EMAIL;
  const history: CorrectionRoundLink[] | null = isAdmin
    ? rounds.map((r) => {
        const last = r.submissions[r.submissions.length - 1];
        return {
          id: last.id,
          sentAt: when(last.created_at),
          pages: mergeCorrectionPages(r.submissions).length,
          open: r.open,
          current: r === round,
        };
      })
    : null;
  const editHref =
    isAdmin && round.open && pages.length
      ? `/galleries/${gallery.id}?openAlbum=1&corrections=1&spread=${pages[0].spread.id}`
      : `/galleries/${gallery.id}?openAlbum=1`;
  const lastPart = round.submissions[round.submissions.length - 1];
  const newer = rounds[0] && rounds[0] !== round ? rounds[0].submissions[rounds[0].submissions.length - 1].id : null;

  return (
    <AlbumCorrectionsView
      title={t("תיקונים מהלקוח · {name}", { name })}
      sentAt={
        parts > 1
          ? t("נשלחו ב-{n} חלקים, האחרון ב-{date}", { n: parts, date: when(lastPart.created_at) })
          : t("נשלחו ב-{date}", { date: when(lastPart.created_at) })
      }
      newerId={newer}
      open={round.open}
      albumStatus={album.status}
      editHref={editHref}
      pages={pages}
      photos={photos}
      customOrnaments={customOrnaments}
      history={history}
    />
  );
}
