import { ownersTabIndexes } from "@/lib/albumAuto/planner";
import type { EventKind } from "@/lib/albumAuto/types";
import { clusterFaces, type FaceBox } from "@/lib/faceRecognition";

// Which photos an automatic collage takes (admin, 2026-10-23, owner's spec): the event's main
// figures. A wedding or a henna: the groom and the bride. A bar mitzvah, עלייה לתורה or a bat
// mitzvah: the child. A bar/bat mitzvah photo session ("בוק"): any photo, freely ("חלוקה חופשית").
// Pure: the UI hands in the gallery's photos and tabs (and, without a tab of the owners, the faces it
// found), and gets back the ids, the best first.

export type CollageSubject = "couple" | "child" | "free";

export function collageSubject(kind: EventKind): CollageSubject {
  if (kind === "wedding" || kind === "henna") return "couple";
  if (kind === "bar_mitzvah" || kind === "bat_mitzvah") return "child";
  return "free";
}

export type PickablePhoto = { id: string; favorite: boolean; folderId: string | null; rejected?: boolean };
export type PickableFolder = { id: string; name: string };

// Where the photos come from:
// - tabs: the owners' tabs ("2.חתן", or "חתן" + "כלה" + "הזוג" at a wedding). Nearly every gallery
//   the owner shoots has one, and the photographer's own sorting beats any guess.
// - faces: no such tab, so the UI finds the main people by their faces (the most frequent ones).
// - all: a photo session, or an event without main figures to look for: the whole gallery, spread
//   over its tabs.
export type CollageSource = { mode: "tabs"; folderIds: string[] } | { mode: "faces"; people: 1 | 2 } | { mode: "all" };

export function collageSource(kind: EventKind, folders: PickableFolder[], photos: PickablePhoto[]): CollageSource {
  const subject = collageSubject(kind);
  if (kind === "book") return { mode: "all" };
  const used = new Set(photos.filter((p) => !p.rejected && p.folderId).map((p) => p.folderId));
  const withPhotos = folders.filter((f) => used.has(f.id));
  const owners = ownersTabIndexes(withPhotos.map((f) => f.name)).map((i) => withPhotos[i].id);
  if (owners.length > 0) return { mode: "tabs", folderIds: owners };
  if (subject === "couple") return { mode: "faces", people: 2 };
  if (subject === "child") return { mode: "faces", people: 1 };
  return { mode: "all" };
}

// The groups a source picks from, each in gallery order: one per owners' tab; for "all", one per tab
// (and the photos outside tabs as one more), so a session shot in three places shows all three.
export function sourceGroups(source: CollageSource, photos: PickablePhoto[], folders: PickableFolder[]): PickablePhoto[][] {
  const kept = photos.filter((p) => !p.rejected);
  if (source.mode === "tabs") return source.folderIds.map((id) => kept.filter((p) => p.folderId === id)).filter((g) => g.length > 0);
  if (source.mode === "all") {
    const known = new Set(folders.map((f) => f.id));
    const groups = folders.map((f) => kept.filter((p) => p.folderId === f.id));
    groups.push(kept.filter((p) => !p.folderId || !known.has(p.folderId)));
    return groups.filter((g) => g.length > 0);
  }
  return [];
}

// `count` spread evenly over `list` (one from each equal slice, at `phase` into it: the middle by
// default), so photos shot a second apart don't sit side by side. Another phase picks other photos
// the same way ("תמונות אחרות").
function spread<T>(list: T[], count: number, phase = 0.5): T[] {
  if (count >= list.length) return [...list];
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => list[Math.min(list.length - 1, Math.floor(((i + phase) * list.length) / count))]);
}

// The phase for the k-th "תמונות אחרות": steps of the golden ratio land far from every earlier one.
export function pickPhase(round: number): number {
  return (0.5 + round * 0.618034) % 1;
}

// How many photos each group gives: by its weight (its size unless weights are given), at least one
// each while there are enough, never more than it has (largest remainders first).
function quotas(sizes: number[], weights: number[], n: number): number[] {
  const out = sizes.map(() => 0);
  let left = Math.min(n, sizes.reduce((a, b) => a + b, 0));
  if (left >= sizes.length) sizes.forEach((s, i) => (out[i] = s > 0 ? 1 : 0));
  left -= out.reduce((a, b) => a + b, 0);
  while (left > 0) {
    const open = sizes.map((s, i) => (out[i] < s ? i : -1)).filter((i) => i >= 0);
    if (open.length === 0) break;
    const total = open.reduce((s, i) => s + weights[i], 0);
    // The group furthest below its fair share takes the next photo.
    const next = open.reduce((best, i) => {
      const lag = (weights[i] / total) * (out.reduce((a, b) => a + b, 0) + 1) - out[i];
      const bestLag = (weights[best] / total) * (out.reduce((a, b) => a + b, 0) + 1) - out[best];
      return lag > bestLag ? i : best;
    }, open[0]);
    out[next]++;
    left--;
  }
  return out;
}

// The collage's photos: `n` from the groups, spread over each group, favorites first (only the
// client's favorites when there are enough of them), the groups taking turns so a couple's tabs or a
// session's places mix. The first id is the best candidate for the big photo: a favorite when there is
// one.
export function pickCollagePhotos(groups: PickablePhoto[][], n: number, weights?: number[], phase = 0.5): string[] {
  let entries = groups.map((g, i) => ({ list: g.filter((p) => !p.rejected), weight: weights?.[i] })).filter((e) => e.list.length > 0);
  if (entries.length === 0 || n <= 0) return [];
  const favorites = entries.reduce((s, e) => s + e.list.filter((p) => p.favorite).length, 0);
  if (favorites >= n) entries = entries.map((e) => ({ ...e, list: e.list.filter((p) => p.favorite) })).filter((e) => e.list.length > 0);
  const lists = entries.map((e) => e.list);
  const q = quotas(
    lists.map((g) => g.length),
    entries.map((e) => e.weight ?? e.list.length),
    n
  );
  const picks = lists.map((g, i) => {
    const fav = g.filter((p) => p.favorite);
    const rest = g.filter((p) => !p.favorite);
    const fromFav = spread(fav, Math.min(q[i], fav.length), phase);
    const fromRest = spread(rest, q[i] - fromFav.length, phase);
    // Back in gallery order, favorites first.
    const chosen = new Set([...fromFav, ...fromRest].map((p) => p.id));
    return [...fav.filter((p) => chosen.has(p.id)), ...rest.filter((p) => chosen.has(p.id))].map((p) => p.id);
  });
  const out: string[] = [];
  for (let round = 0; out.length < n && picks.some((p) => p.length > round); round++) {
    for (const p of picks) if (p[round] !== undefined && out.length < n) out.push(p[round]);
  }
  return out;
}

// ── Without a tab of the owners: the main people by their faces ─────────────────────────────

export type PhotoFacesFound = { photoId: string; faces: { descriptor: number[]; box: FaceBox }[] };

// The photos to look for faces in: the favorites first, then the rest spread over the gallery, up to
// `max` (a whole gallery takes minutes in the browser; 60 photos well spread find the couple).
export function faceSample(photos: PickablePhoto[], max = 60): string[] {
  const kept = photos.filter((p) => !p.rejected);
  const fav = kept.filter((p) => p.favorite);
  const favPick = spread(fav, Math.min(fav.length, Math.ceil(max * 0.6)));
  const chosen = new Set(favPick.map((p) => p.id));
  const rest = kept.filter((p) => !chosen.has(p.id));
  for (const p of spread(rest, max - favPick.length)) chosen.add(p.id);
  return kept.filter((p) => chosen.has(p.id)).map((p) => p.id);
}

// Tested 2026-10-23 on 28 wedding photos of different couples: two different grooms' faces came out
// 0.44 apart and a groom and a far smaller face 0.38, inside the usual same-person range, so at the
// face filter's 0.55 four couples merged into "the two people who appear most". Hence: faces big
// enough to tell who it is (7% of the photo's height and up), a stricter match, and a person counts
// only when they're in a real share of the photos (an event's main figures are in far more than 12%).
export const MAIN_FACE_MIN_HEIGHT = 0.07;
export const MAIN_FACE_MATCH = 0.42;
export const MAIN_PERSON_MIN_SHARE = 0.12;

// The groups for pickCollagePhotos from the faces found: the most frequent person (a child's event)
// or two (a couple), counting only the main faces of each photo (at least half the height of its
// biggest face, not a guest far behind, and big enough to tell who it is). A couple gives three
// groups, the two together first (half of the collage), then each alone. Null when nobody shows up
// in at least 3 photos (2 in a small sample) and 12% of them: the collage then takes the whole
// gallery, which beats a confident wrong guess.
export function mainPeopleGroups(found: PhotoFacesFound[], people: 1 | 2): { groups: string[][]; weights: number[] } | null {
  const faces: { photoId: string; descriptor: number[] }[] = [];
  for (const p of found) {
    const biggest = Math.max(0, ...p.faces.map((f) => f.box.height));
    for (const f of p.faces) if (f.box.height >= biggest * 0.5 && f.box.height >= MAIN_FACE_MIN_HEIGHT) faces.push({ photoId: p.photoId, descriptor: f.descriptor });
  }
  if (faces.length === 0) return null;
  const minPhotos = Math.max(found.length >= 20 ? 3 : 2, Math.ceil(found.length * MAIN_PERSON_MIN_SHARE));
  const clusters = clusterFaces(faces, MAIN_FACE_MATCH)
    .map((c) => ({ photos: new Set(c.members.map((m) => m.photoId)) }))
    .filter((c) => c.photos.size >= minPhotos)
    .sort((a, b) => b.photos.size - a.photos.size);
  if (clusters.length === 0) return null;
  const order = found.map((p) => p.photoId);
  const inOrder = (set: Set<string>) => order.filter((id) => set.has(id));
  const a = clusters[0].photos;
  if (people === 1 || clusters.length === 1) return { groups: [inOrder(a)], weights: [1] };
  const b = clusters[1].photos;
  const together = new Set([...a].filter((id) => b.has(id)));
  const aOnly = new Set([...a].filter((id) => !b.has(id)));
  const bOnly = new Set([...b].filter((id) => !a.has(id)));
  const entries = [
    { ids: inOrder(together), weight: 2 },
    { ids: inOrder(aOnly), weight: 1 },
    { ids: inOrder(bOnly), weight: 1 },
  ].filter((e) => e.ids.length > 0);
  return { groups: entries.map((e) => e.ids), weights: entries.map((e) => e.weight) };
}
