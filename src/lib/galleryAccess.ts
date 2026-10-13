import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { GalleryRow } from "@/lib/types";

// A public gallery link is one of two kinds (2026-10-13):
// - the client's own link (galleries.access_token): everything, including favorites, the selection,
//   album approval and uploads;
// - a read-only share link (gallery_share_links, migration 0167), made by "share my gallery" in the
//   client's gallery: viewing and downloading only, within the scope stored with it (tabs or exact
//   photos, and the quality). The scope is enforced here on the server, not by URL parameters.
// Write routes keep matching galleries.access_token alone, so a share token never writes anything.

export type GalleryShareScope = {
  folderKeys: string[] | null; // null = every tab; NO_FOLDER_KEY = photos without a tab
  photoIds: string[] | null; // null = no photo filter
  quality: "full" | "web";
};

export type GalleryAccess = {
  gallery: GalleryRow;
  readOnly: boolean;
  scope: GalleryShareScope | null; // null for the client's own link
};

export const NO_FOLDER_KEY = "none";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export async function resolveGalleryToken(supabase: ServiceClient, token: string): Promise<GalleryAccess | null> {
  if (!UUID_RE.test(token)) return null;
  const { data: gallery } = await supabase.from("galleries").select("*").eq("access_token", token).maybeSingle<GalleryRow>();
  if (gallery) return { gallery, readOnly: false, scope: null };

  const { data: share } = await supabase
    .from("gallery_share_links")
    .select("gallery_id, folder_keys, photo_ids, quality")
    .eq("token", token)
    .maybeSingle<{ gallery_id: string; folder_keys: string[] | null; photo_ids: string[] | null; quality: "full" | "web" }>();
  if (!share) return null;
  const { data: shared } = await supabase.from("galleries").select("*").eq("id", share.gallery_id).maybeSingle<GalleryRow>();
  if (!shared) return null;
  return {
    gallery: shared,
    readOnly: true,
    scope: { folderKeys: share.folder_keys, photoIds: share.photo_ids, quality: share.quality === "web" ? "web" : "full" },
  };
}

export function photoInScope(photo: { id: string; folder_id: string | null }, scope: GalleryShareScope | null): boolean {
  if (!scope) return true;
  if (scope.photoIds && !scope.photoIds.includes(photo.id)) return false;
  if (scope.folderKeys && !scope.folderKeys.includes(photo.folder_id ?? NO_FOLDER_KEY)) return false;
  return true;
}

// A share made from a share link can only narrow it: the tabs and photos it names are kept only if
// the parent link covers them, and a web-quality parent keeps every child at web quality.
export function narrowScope(
  parent: GalleryShareScope | null,
  requested: { folderKeys: string[] | null; photoIds: string[] | null; quality: "full" | "web" }
): GalleryShareScope {
  const quality = parent?.quality === "web" ? "web" : requested.quality;
  const folderKeys =
    parent?.folderKeys && requested.folderKeys
      ? requested.folderKeys.filter((k) => parent.folderKeys!.includes(k))
      : (requested.folderKeys ?? parent?.folderKeys ?? null);
  const photoIds =
    parent?.photoIds && requested.photoIds
      ? requested.photoIds.filter((id) => parent.photoIds!.includes(id))
      : (requested.photoIds ?? parent?.photoIds ?? null);
  return { folderKeys, photoIds, quality };
}
