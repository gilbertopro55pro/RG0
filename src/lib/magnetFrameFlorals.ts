// Built-in watercolor floral elements for the magnet-frame design tool — real AI-generated raster
// illustrations (not the earlier procedural-SVG "watercolor" attempt, which the photographer flagged
// as missing the intended reference look and which these fully replace), served as static files
// rather than through the per-photographer custom-element upload pipeline since they're a shared
// library asset, not anyone's own upload. Not recolorable (unlike an AlbumOrnament) since each is a
// real painted image, not a procedural shape — same reasoning as a photographer's own uploaded
// customElementAssetId image.
export type MagnetFrameFloral = { id: string; label: string; url: string };

export const MAGNET_FRAME_FLORALS: MagnetFrameFloral[] = [
  { id: "wc2-corner-blue", label: "פינת פרחים כחולה", url: "/magnet-elements/wc2-corner-blue.png" },
  { id: "wc2-corner-blush", label: "פינת פרחים ורודה עדינה", url: "/magnet-elements/wc2-corner-blush.png" },
  { id: "wc2-corner-peach", label: "פינת פרחים אפרסק", url: "/magnet-elements/wc2-corner-peach.png" },
  { id: "wc2-corner-lavender", label: "פינת פרחים לבנדר", url: "/magnet-elements/wc2-corner-lavender.png" },
  { id: "wc2-corner-burgundy", label: "פינת פרחים בורדו", url: "/magnet-elements/wc2-corner-burgundy.png" },
  { id: "wc2-spray-sunset", label: "זר אורכי שקיעה", url: "/magnet-elements/wc2-spray-sunset.png" },
  { id: "wc2-spray-sage", label: "זר אורכי מרווה", url: "/magnet-elements/wc2-spray-sage.png" },
  { id: "wc2-spray-rainbow", label: "זר אורכי קשת בענן", url: "/magnet-elements/wc2-spray-rainbow.png" },
  { id: "wc2-spray-dustyrose", label: "זר אורכי ורוד מאובק", url: "/magnet-elements/wc2-spray-dustyrose.png" },
  { id: "wc2-spray-yellow", label: "זר אורכי צהוב", url: "/magnet-elements/wc2-spray-yellow.png" },
  { id: "wc2-bouquet-ivory", label: "זר שנהב וזהב", url: "/magnet-elements/wc2-bouquet-ivory.png" },
  { id: "wc2-bouquet-coral", label: "זר קורל וורוד", url: "/magnet-elements/wc2-bouquet-coral.png" },
  { id: "wc2-bouquet-navy", label: "זר כחול נייבי", url: "/magnet-elements/wc2-bouquet-navy.png" },
  { id: "wc2-bouquet-mint", label: "זר מנטה", url: "/magnet-elements/wc2-bouquet-mint.png" },
  { id: "wc2-bouquet-pastel", label: "זר פסטל", url: "/magnet-elements/wc2-bouquet-pastel.png" },
  { id: "wc2-sprig-pink", label: "ענף פרח ורוד", url: "/magnet-elements/wc2-sprig-pink.png" },
  { id: "wc2-sprig-blue", label: "ענף פרח כחול", url: "/magnet-elements/wc2-sprig-blue.png" },
  { id: "wc2-sprig-yellow", label: "ענף פרח צהוב", url: "/magnet-elements/wc2-sprig-yellow.png" },
  { id: "wc2-sprig-purple", label: "ענף פרח סגול", url: "/magnet-elements/wc2-sprig-purple.png" },
  { id: "wc2-sprig-white", label: "ענף פרח לבן", url: "/magnet-elements/wc2-sprig-white.png" },
  { id: "wc2-wreath-pastel", label: "זר עגול פסטל", url: "/magnet-elements/wc2-wreath-pastel.png" },
  { id: "wc2-wreath-festive", label: "זר עגול חגיגי אדום", url: "/magnet-elements/wc2-wreath-festive.png" },
  { id: "wc2-wreath-blue", label: "זר עגול כחול", url: "/magnet-elements/wc2-wreath-blue.png" },
  { id: "wc2-wreath-gold", label: "זר עגול ורוד וזהב", url: "/magnet-elements/wc2-wreath-gold.png" },
  { id: "wc2-wreath-autumn", label: "זר עגול סתווי", url: "/magnet-elements/wc2-wreath-autumn.png" },
  // 20 more, in the same real-watercolor illustration style — creative compositions beyond the
  // corner/spray/bouquet/sprig/wreath templates above (a branch, a heart shape, scattered petals,
  // greenery-only, a crescent gap for a monogram, and more).
  { id: "wc3-cherry-branch", label: "ענף פריחת דובדבן", url: "/magnet-elements/wc3-cherry-branch.png" },
  { id: "wc3-peony-cascade", label: "מפל אדמוניות", url: "/magnet-elements/wc3-peony-cascade.png" },
  { id: "wc3-floral-heart", label: "לב פרחים", url: "/magnet-elements/wc3-floral-heart.png" },
  { id: "wc3-tropical-protea", label: "פרחי טרופי", url: "/magnet-elements/wc3-tropical-protea.png" },
  { id: "wc3-sunflower-cluster", label: "צרור חמניות", url: "/magnet-elements/wc3-sunflower-cluster.png" },
  { id: "wc3-lavender-bundle", label: "צרור לבנדר", url: "/magnet-elements/wc3-lavender-bundle.png" },
  { id: "wc3-ivy-corner", label: "פינת קיסוס", url: "/magnet-elements/wc3-ivy-corner.png" },
  { id: "wc3-scattered-petals", label: "עלי כותרת מפוזרים", url: "/magnet-elements/wc3-scattered-petals.png" },
  { id: "wc3-crescent-monogram", label: "זר חצי-סהר למונוגרם", url: "/magnet-elements/wc3-crescent-monogram.png" },
  { id: "wc3-cross-spray-jewel", label: "זרים חוצים בגווני אבן חן", url: "/magnet-elements/wc3-cross-spray-jewel.png" },
  { id: "wc3-pressed-botanical-row", label: "שורת פרחים בוטנית", url: "/magnet-elements/wc3-pressed-botanical-row.png" },
  { id: "wc3-butterfly-blossoms", label: "פרחים ופרפר", url: "/magnet-elements/wc3-butterfly-blossoms.png" },
  { id: "wc3-anemone-eucalyptus", label: "כלניות ואקליפטוס", url: "/magnet-elements/wc3-anemone-eucalyptus.png" },
  { id: "wc3-wildflower-meadow", label: "פזורת פרחי בר", url: "/magnet-elements/wc3-wildflower-meadow.png" },
  { id: "wc3-tulip-spring", label: "צבעונים אביביים", url: "/magnet-elements/wc3-tulip-spring.png" },
  { id: "wc3-magnolia-branch", label: "ענף מגנוליה", url: "/magnet-elements/wc3-magnolia-branch.png" },
  { id: "wc3-autumn-garland", label: "גרלנד עלי סתיו", url: "/magnet-elements/wc3-autumn-garland.png" },
  { id: "wc3-orchid-elegant", label: "סחלבים אלגנטיים", url: "/magnet-elements/wc3-orchid-elegant.png" },
  { id: "wc3-daisy-chain", label: "שרשרת חינניות", url: "/magnet-elements/wc3-daisy-chain.png" },
  { id: "wc3-boho-dried", label: "זר בוהו יבש", url: "/magnet-elements/wc3-boho-dried.png" },
];

const byId = new Map(MAGNET_FRAME_FLORALS.map((f) => [f.id, f]));

export function findMagnetFrameFloral(id: string | undefined): MagnetFrameFloral | undefined {
  return id ? byId.get(id) : undefined;
}
