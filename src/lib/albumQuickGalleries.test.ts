import { describe, expect, it } from "vitest";
import { albumQuickGalleriesFrom } from "@/lib/albumQuickGalleries";

const gallery = (id: string, event_id: string | null, gallery_albums: { gallery_id: string } | { gallery_id: string }[] | null = null) => ({
  id,
  title: id,
  published: false,
  event_id,
  gallery_albums,
});

describe("albumQuickGalleriesFrom", () => {
  const events = [
    { id: "e-builtin", event_stages: [{ stage_key: "shoot_day", custom_stage_id: null }, { stage_key: "album_design", custom_stage_id: null }] },
    { id: "e-custom", event_stages: [{ stage_key: null, custom_stage_id: "c-album" }] },
    { id: "e-none", event_stages: [{ stage_key: "shoot_day", custom_stage_id: null }, { stage_key: null, custom_stage_id: "c-video" }] },
  ];
  const customStages = [
    { id: "c-album", name: "עיצוב אלבום משפחתי" },
    { id: "c-video", name: "עריכת וידאו" },
  ];

  it("lists galleries whose event has an album stage, built-in or custom", () => {
    const out = albumQuickGalleriesFrom([gallery("g1", "e-builtin"), gallery("g2", "e-custom"), gallery("g3", "e-none")], events, customStages);
    expect(out.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(out.every((g) => !g.hasActiveAlbum)).toBe(true);
  });

  it("keeps a gallery that already has an album, whatever its package (as an object or an array)", () => {
    const out = albumQuickGalleriesFrom(
      [gallery("g3", "e-none", { gallery_id: "g3" }), gallery("g4", null, [{ gallery_id: "g4" }]), gallery("g5", null, [])],
      events,
      customStages
    );
    expect(out).toEqual([
      { id: "g3", title: "g3", published: false, hasActiveAlbum: true },
      { id: "g4", title: "g4", published: false, hasActiveAlbum: true },
    ]);
  });

  it("keeps the galleries' order", () => {
    const out = albumQuickGalleriesFrom([gallery("b", "e-custom"), gallery("a", "e-builtin")], events, customStages);
    expect(out.map((g) => g.id)).toEqual(["b", "a"]);
  });
});
