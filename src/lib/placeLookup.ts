// Checks that an event location the client typed actually exists, for the intake assistant's
// check_location tool (owner's request, 2026-10-04: a made-up place "Kirtay sababa" was accepted
// as is; clients also misspell real places). OpenStreetMap search (Nominatim, then Photon as a
// fallback), limited to Israel. Small halls and synagogues are often missing from the map, so a
// "not found" is a reason to ask the client, never to reject the place.

export type PlaceMatch = { name: string; kind: string; area: string };
export type PlaceLookup = { found: boolean; matches: PlaceMatch[]; error?: true };

const UA = "Gilberto-intake/1.0 (https://myframeflow.com)";
const TIMEOUT_MS = 4000;

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "he,en" }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

type NominatimHit = { name?: string; display_name?: string; type?: string; addresstype?: string };

async function nominatim(query: string): Promise<PlaceMatch[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=il&limit=4&addressdetails=0&q=${encodeURIComponent(query)}`;
  const hits = (await getJson(url)) as NominatimHit[];
  return (Array.isArray(hits) ? hits : []).map((h) => {
    const parts = (h.display_name ?? "").split(",").map((s) => s.trim());
    return { name: h.name || parts[0] || "", kind: h.addresstype || h.type || "", area: parts.slice(1, 3).join(", ") };
  });
}

type PhotonFeature = { properties?: { name?: string; city?: string; county?: string; type?: string; osm_value?: string; countrycode?: string } };

async function photon(query: string): Promise<PlaceMatch[]> {
  // Bounding box of Israel (lon/lat), so a homonym abroad isn't reported as a match.
  const url = `https://photon.komoot.io/api/?limit=4&bbox=34.2,29.4,35.9,33.4&q=${encodeURIComponent(query)}`;
  const data = (await getJson(url)) as { features?: PhotonFeature[] };
  return (data.features ?? [])
    .map((f) => f.properties ?? {})
    .filter((p) => !p.countrycode || p.countrycode.toUpperCase() === "IL")
    .map((p) => ({ name: p.name ?? "", kind: p.osm_value || p.type || "", area: [p.city, p.county].filter(Boolean).join(", ") }));
}

export async function lookupPlace(query: string): Promise<PlaceLookup> {
  const q = query.trim().slice(0, 120);
  if (!q) return { found: false, matches: [] };
  for (const source of [nominatim, photon]) {
    try {
      const matches = (await source(q)).filter((m) => m.name).slice(0, 3);
      return { found: matches.length > 0, matches };
    } catch (e) {
      console.error("Intake place lookup failed:", source.name, e instanceof Error ? e.message : e);
    }
  }
  return { found: false, matches: [], error: true };
}
