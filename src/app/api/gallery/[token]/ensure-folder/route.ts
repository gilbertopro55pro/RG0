import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { GalleryRow } from "@/lib/types";
import type { GalleryFolderNode as Folder } from "@/lib/galleryFolders";
import { parseEnsureFolderBody } from "@/lib/galleryFolderEnsure";

// Client-facing counterpart to GalleryManageView.tsx's ensureFolderId — get-or-create a folder
// tab by name, scoped to this gallery, so a client dragging in "1.אווירה / 2.טקס" folders lands
// their photos under the same named tabs the photographer would have gotten from the same drop.
// A sub-tab (migration 0203) goes under the open event (parentId, a main tab of this gallery) or
// under the dropped top folder's main tab (parentName, made here first when it's new).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const req = parseEnsureFolderBody(await request.json().catch(() => null));

  if (!req) {
    return NextResponse.json({ error: "שם תיקייה חסר" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .eq("published", true)
    .is("archived_at", null)
    .maybeSingle<GalleryRow>();

  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }
  if (!gallery.allow_client_upload) {
    return NextResponse.json({ error: "העלאת תמונות אינה מופעלת עבור גלריה זו" }, { status: 403 });
  }

  const findFolder = async (name: string, parentId: string | null) => {
    const q = supabase.from("gallery_folders").select("*").eq("gallery_id", gallery.id).eq("name", name);
    const { data } = await (parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null)).maybeSingle<Folder>();
    return data;
  };

  const getOrCreate = async (name: string, parentId: string | null): Promise<{ folder: Folder | null; error?: string }> => {
    const found = await findFolder(name, parentId);
    if (found) return { folder: found };
    const siblings = supabase.from("gallery_folders").select("id", { count: "exact", head: true }).eq("gallery_id", gallery.id);
    const { count } = await (parentId ? siblings.eq("parent_id", parentId) : siblings.is("parent_id", null));
    const { data: folder, error } = await supabase
      .from("gallery_folders")
      .insert({ gallery_id: gallery.id, photographer_id: gallery.photographer_id, name, sort_order: count ?? 0, parent_id: parentId })
      .select("*")
      .single<Folder>();
    if (!error && folder) return { folder };
    // Unique (gallery_id, parent_id, name) violation — a sibling file in the same dropped folder
    // already created it a moment ago (client uploads run one file at a time, so this is a real race).
    const existing = await findFolder(name, parentId);
    return existing ? { folder: existing } : { folder: null, error: error?.message };
  };

  let parent: Folder | null = null;
  if (req.parent && "id" in req.parent) {
    // The open event: a main tab of this gallery, never another gallery's or a sub-tab.
    const { data } = await supabase
      .from("gallery_folders")
      .select("*")
      .eq("id", req.parent.id)
      .eq("gallery_id", gallery.id)
      .is("parent_id", null)
      .maybeSingle<Folder>();
    if (!data) return NextResponse.json({ error: "הלשונית לא נמצאה" }, { status: 404 });
    parent = data;
  } else if (req.parent) {
    const made = await getOrCreate(req.parent.name, null);
    if (!made.folder) return NextResponse.json({ error: made.error ?? "שגיאה ביצירת התיקייה" }, { status: 500 });
    parent = made.folder;
  }

  const { folder, error } = await getOrCreate(req.name, parent?.id ?? null);
  if (!folder) {
    return NextResponse.json({ error: error ?? "שגיאה ביצירת התיקייה" }, { status: 500 });
  }
  return NextResponse.json({ folder, parent });
}
