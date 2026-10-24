// The home screen's album-design quick access (AlbumQuickAccessButton): published and draft
// galleries alike (an album can be designed before the client-facing gallery ever goes live),
// without the hidden portfolio-only gallery or anything archived (the query filters those). Only
// galleries whose event's package has an album design stage (the built-in one, or a custom stage
// named "עיצוב אלבום"), plus any gallery that already has an album, so started work never
// disappears (owner's request, 2026-09-27).
//
// hasActiveAlbum: the gallery has a gallery_albums row, inserted the moment step 1 of the album
// wizard completes (buildStyledAlbum/buildAlbumFromBookTemplate in GalleryManageView.tsx), so its
// mere existence is already "there's something to export".
//
// The album stage comes from the events' stages the home page already fetched (every event of the
// photographer), so this costs no queries of its own (it used to be three, one after another).

export type AlbumQuickGallery = { id: string; title: string; published: boolean; hasActiveAlbum: boolean };

type GalleryForAlbum = {
  id: string;
  title: string;
  published: boolean;
  event_id: string | null;
  // gallery_albums.gallery_id is unique, so PostgREST embeds it as one object (or null).
  gallery_albums: { gallery_id: string } | { gallery_id: string }[] | null;
};

export function albumQuickGalleriesFrom(
  galleries: GalleryForAlbum[],
  events: { id: string; event_stages: { stage_key: string | null; custom_stage_id: string | null }[] }[],
  customStages: { id: string; name: string }[]
): AlbumQuickGallery[] {
  const hasAlbum = (g: GalleryForAlbum) => (Array.isArray(g.gallery_albums) ? g.gallery_albums.length > 0 : !!g.gallery_albums);
  const albumCustomStageIds = new Set(customStages.filter((c) => c.name.includes("עיצוב אלבום")).map((c) => c.id));
  const eventsWithAlbumStage = new Set(
    events
      .filter((e) => e.event_stages.some((s) => s.stage_key === "album_design" || (!!s.custom_stage_id && albumCustomStageIds.has(s.custom_stage_id))))
      .map((e) => e.id)
  );
  return galleries
    .filter((g) => hasAlbum(g) || (g.event_id !== null && eventsWithAlbumStage.has(g.event_id)))
    .map((g) => ({ id: g.id, title: g.title, published: g.published, hasActiveAlbum: hasAlbum(g) }));
}
