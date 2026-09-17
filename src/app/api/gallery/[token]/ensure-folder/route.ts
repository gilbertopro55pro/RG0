import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { GalleryFolderRow, GalleryRow } from "@/lib/types";

// Client-facing counterpart to GalleryManageView.tsx's ensureFolderId — get-or-create a folder
// tab by name, scoped to this gallery, so a client dragging in "1.אווירה / 2.טקס" folders lands
// their photos under the same named tabs the photographer would have gotten from the same drop.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { folderName }: { folderName: string } = await request.json();

  if (!folderName?.trim()) {
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

  const { count } = await supabase
    .from("gallery_folders")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", gallery.id);

  const { data: folder, error } = await supabase
    .from("gallery_folders")
    .insert({ gallery_id: gallery.id, photographer_id: gallery.photographer_id, name: folderName.trim(), sort_order: count ?? 0 })
    .select("*")
    .single<GalleryFolderRow>();

  if (!error && folder) {
    return NextResponse.json({ folder });
  }

  // Unique (gallery_id, name) violation — a sibling file in the same dropped folder already
  // created it a moment ago (client uploads run one file at a time, so this is a real race).
  const { data: existing } = await supabase
    .from("gallery_folders")
    .select("*")
    .eq("gallery_id", gallery.id)
    .eq("name", folderName.trim())
    .maybeSingle<GalleryFolderRow>();

  if (!existing) {
    return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת התיקייה" }, { status: 500 });
  }
  return NextResponse.json({ folder: existing });
}
