import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { parseClientEditRequest } from "@/lib/albumClientEdit";
import { applyClientEdit, type EditPhoto, type EditSpread } from "@/lib/albumAuto/clientEdits";
import type { FaceRect } from "@/lib/albumAuto/swapPhotos";
import type { AlbumFrame, AlbumPhotoElement, GalleryAlbumRow, GalleryRow } from "@/lib/types";

export const runtime = "nodejs";

// The client changes the album design in the gallery (owner, 2026-10-27; lib/albumClientEdit.ts):
// swaps photos, redesigns a page, goes back a design, or undoes all their changes. Only the
// client's own gallery link (galleries.access_token, published, not archived), and only while the
// album waits for their approval ("sent"). The request only names the action and the frames; the
// pages are computed and saved here (lib/albumAuto/clientEdits.ts), so the album keeps exactly its
// photos whatever the browser sends.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Generous for a client browsing designs, a ceiling for a flood (each redesign computes layouts).
  const { allowed } = await checkRateLimit(`album-edit:${clientIpFrom(request)}`, { maxRequests: 300, windowSeconds: 600 });
  if (!allowed) return NextResponse.json({ error: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות" }, { status: 429 });

  const req = parseClientEditRequest(await request.json().catch(() => null));
  if (!req) return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, photographer_id")
    .eq("access_token", token)
    .eq("published", true)
    .is("archived_at", null)
    .maybeSingle<Pick<GalleryRow, "id" | "photographer_id">>();
  if (!gallery) return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });

  const { data: album } = await supabase
    .from("gallery_albums")
    .select("id, status, width_cm, height_cm, safe_margin_cm, auto_style")
    .eq("gallery_id", gallery.id)
    .neq("status", "draft")
    .maybeSingle<Pick<GalleryAlbumRow, "id" | "status" | "width_cm" | "height_cm" | "safe_margin_cm" | "auto_style">>();
  if (!album) return NextResponse.json({ error: "האלבום לא נמצא" }, { status: 404 });
  // Approved, or waiting for the photographer's update after corrections.
  if (album.status !== "sent") return NextResponse.json({ error: "העיצוב כבר לא פתוח לשינויים" }, { status: 409 });

  const { data: spreads } = await supabase
    .from("gallery_album_spreads")
    .select("id, layout, elements, background_photo_id, width_cm, height_cm, marked_frames, client_original, client_history, client_edited_at")
    .eq("album_id", album.id)
    .order("sort_order", { ascending: true })
    .returns<(EditSpread & { layout: string; client_edited_at: string | null })[]>();
  if (!spreads?.length) return NextResponse.json({ error: "האלבום לא נמצא" }, { status: 404 });

  // The photos (proportions, faces) of the pages this action can change, and the photographer's own
  // page templates when a page may be redesigned.
  const pageIds = req.action === "swap" ? [req.a.spreadId, req.b.spreadId] : req.action === "reset" ? [] : [req.spreadId];
  const photoIds = [
    ...new Set(
      spreads
        .filter((sp) => pageIds.includes(sp.id))
        .flatMap((sp) => (sp.elements ?? []).filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId).map((el) => el.photoId as string))
    ),
  ];
  const mayRedesign = req.action === "redesign" || (req.action === "swap" && req.redesign);
  const [{ data: photoRows }, { data: faceRows }, { data: templateRows }] = await Promise.all([
    photoIds.length
      ? supabase.from("gallery_photos").select("id, preview_aspect_ratio").eq("gallery_id", gallery.id).in("id", photoIds).returns<{ id: string; preview_aspect_ratio: number | null }[]>()
      : Promise.resolve({ data: [] as { id: string; preview_aspect_ratio: number | null }[] }),
    photoIds.length
      ? supabase
          .from("gallery_photo_faces")
          .select("photo_id, box_x, box_y, box_width, box_height")
          .eq("gallery_id", gallery.id)
          .in("photo_id", photoIds)
          .returns<{ photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number }[]>()
      : Promise.resolve({ data: [] as { photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number }[] }),
    mayRedesign
      ? supabase.from("album_templates").select("frames").eq("photographer_id", gallery.photographer_id).order("created_at", { ascending: false }).returns<{ frames: AlbumFrame[] }[]>()
      : Promise.resolve({ data: [] as { frames: AlbumFrame[] }[] }),
  ]);
  const faces = new Map<string, FaceRect[]>();
  for (const r of faceRows ?? []) faces.set(r.photo_id, [...(faces.get(r.photo_id) ?? []), { x: r.box_x, y: r.box_y, width: r.box_width, height: r.box_height }]);
  const photos = new Map<string, EditPhoto>(
    (photoRows ?? []).map((p) => [p.id, { aspect: Number(p.preview_aspect_ratio) || 0, ...(faces.get(p.id)?.length ? { faces: faces.get(p.id) } : {}) }] as const)
  );

  const outcome = applyClientEdit(
    {
      album,
      spreads,
      photos,
      userTemplates: (templateRows ?? []).map((t) => t.frames).filter((f) => Array.isArray(f)),
      idPrefix: `c${Date.now().toString(36)}`,
    },
    req
  );
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, code: outcome.code, pages: outcome.pages }, { status: outcome.status });

  // Saved together: a swap between pages that saved only one of them would show a photo twice. A
  // page that failed puts the ones that saved back as they were.
  const now = new Date().toISOString();
  const before = new Map(spreads.map((sp) => [sp.id, sp] as const));
  const results = await Promise.all(
    outcome.updates.map((u) =>
      supabase
        .from("gallery_album_spreads")
        .update({
          elements: u.elements,
          background_photo_id: u.background_photo_id,
          marked_frames: u.marked_frames,
          client_original: u.client_original,
          client_history: u.client_history,
          client_edited_at: u.edited ? now : null,
          ...(u.layout ? { layout: u.layout } : {}),
        })
        .eq("id", u.id)
        .eq("album_id", album.id)
    )
  );
  if (results.some((r) => r.error)) {
    await Promise.all(
      outcome.updates.map((u, i) => {
        if (results[i].error) return null;
        const sp = before.get(u.id);
        if (!sp) return null;
        return supabase
          .from("gallery_album_spreads")
          .update({
            layout: sp.layout,
            elements: sp.elements,
            background_photo_id: sp.background_photo_id,
            marked_frames: sp.marked_frames,
            client_original: sp.client_original,
            client_history: sp.client_history,
            client_edited_at: sp.client_edited_at,
          })
          .eq("id", u.id);
      })
    );
    console.error("[album/edit] save failed", results.find((r) => r.error)?.error);
    return NextResponse.json({ error: "השינוי לא נשמר. נסו שוב" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    spreads: outcome.updates.map((u) => ({
      id: u.id,
      elements: u.elements,
      backgroundPhotoId: u.background_photo_id,
      edited: u.edited,
      canBack: !!u.client_history?.length,
    })),
    cycles: outcome.cycles,
  });
}
