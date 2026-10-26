import { isWeddingEvent } from "@/lib/clipSongs";
import type { EventRow } from "@/lib/types";

// Whether the client can choose one clip song or two (a calm one and an upbeat one): a wedding
// (owner, 2026-10-13), and a freelance job (owner, 2026-10-26). The song stage exists only in a
// package with a clip, so these are the freelance jobs that include a clip. Any other event has one
// song. Shared by the portal, the event page and the routes that save the songs. Not in
// lib/clipSongs.ts, which is part of the PDF worker's build.
export function allowsTwoSongs(event: Pick<EventRow, "event_type" | "package" | "is_freelance">): boolean {
  return isWeddingEvent(event.event_type) || !!event.is_freelance || (event.package?.startsWith("freelance_") ?? false);
}
