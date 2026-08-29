import { NextResponse, after, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { bucketPhotosIntoParts, chunkArray, triggerZipJobProcessing } from "@/lib/zipJobs";
import type { GalleryPhotoRow, GalleryRow } from "@/lib/types";

// Kicks off a background zip build instead of building it inline in this request — the
// synchronous download-zip route works for a reasonably-sized selection, but a gallery with
// hundreds/thousands of photos genuinely can't finish downloading+zipping every source file
// within one serverless function's time limit; the connection just gets cut mid-stream, leaving
// the client with a truncated, corrupted file and no error message. This splits the request into
// fixed-size parts, each processed as its own short job (see src/lib/zipJobs.ts), and returns
// immediately with a batch id the client polls for progress.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { photoIds, quality }: { photoIds: string[]; quality?: "full" | "web" } = await request.json();

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return NextResponse.json({ error: "לא נבחרו תמונות" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .maybeSingle<GalleryRow>();

  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const serverAuthClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await serverAuthClient.auth.getUser();
  const isOwner = !!user && user.id === gallery.photographer_id;

  if (!isOwner) {
    if (!gallery.published || gallery.archived_at) {
      return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
    }
    if (!gallery.allow_downloads) {
      return NextResponse.json({ error: "הורדת תמונות מכובה עבור גלריה זו" }, { status: 403 });
    }
  }

  const photoChunkResults = await Promise.all(
    chunkArray(photoIds).map((ids) => {
      let q = supabase
        .from("gallery_photos")
        .select("id, file_size_bytes")
        .eq("gallery_id", gallery.id)
        .in("id", ids);
      if (!isOwner) q = q.neq("culling_status", "rejected");
      return q.returns<Pick<GalleryPhotoRow, "id" | "file_size_bytes">[]>();
    })
  );
  const photos = photoChunkResults.flatMap((r) => r.data ?? []);
  if (photos.length === 0) {
    return NextResponse.json({ error: "התמונות לא נמצאו" }, { status: 404 });
  }

  const batchId = randomUUID();
  const parts = bucketPhotosIntoParts(photos);

  const { data: jobs, error } = await supabase
    .from("gallery_zip_jobs")
    .insert(
      parts.map((ids, index) => ({
        gallery_id: gallery.id,
        batch_id: batchId,
        part_index: index,
        part_count: parts.length,
        photo_ids: ids,
        total_count: ids.length,
        quality: quality === "web" ? "web" : "full",
      }))
    )
    .select("id, part_index")
    .order("part_index", { ascending: true })
    .returns<{ id: string; part_index: number }[]>();

  if (error || !jobs || jobs.length === 0) {
    return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת המשימה" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const firstJobId = jobs[0].id;
  // Deferred until after the response is sent — the client gets the batch id immediately instead
  // of waiting on this trigger request to complete.
  after(() => triggerZipJobProcessing(firstJobId, origin));

  return NextResponse.json({ batchId, partCount: parts.length });
}
