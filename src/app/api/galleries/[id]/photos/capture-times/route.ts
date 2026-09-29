import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { downloadObjectRange } from "@/lib/storage";
import { exifDateTimeOriginal } from "@/lib/exifDate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Small batches so one call stays well inside maxDuration even on a slow R2 day; the client loops
// until `remaining` is 0.
const BATCH_SIZE = 40;
const CONCURRENCY = 8;
// EXIF sits in the JPEG's first segment, so the head of the file is enough — never the full original.
const HEAD_BYTES = 131072;

// Fills gallery_photos.taken_at from each original's EXIF shooting time (migration 0142), so the
// automatic album designer can order the event's stages chronologically. taken_at_checked_at marks
// a photo as done even when it has no date, so it's never re-downloaded.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: galleryId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: gallery } = await admin
    .from("galleries")
    .select("photographer_id")
    .eq("id", galleryId)
    .maybeSingle<{ photographer_id: string }>();
  if (!gallery || gallery.photographer_id !== user.id) {
    return NextResponse.json({ error: "אין הרשאה לגלריה הזו" }, { status: 403 });
  }

  const { data: photos, error } = await admin
    .from("gallery_photos")
    .select("id, storage_path")
    .eq("gallery_id", galleryId)
    .is("taken_at_checked_at", null)
    .order("sort_order", { ascending: true })
    .limit(BATCH_SIZE)
    .returns<{ id: string; storage_path: string }[]>();
  if (error) {
    return NextResponse.json({ error: "שגיאה בטעינת התמונות" }, { status: 500 });
  }

  let checked = 0;
  let withDate = 0;
  const queue = [...(photos ?? [])];
  const worker = async () => {
    for (let photo = queue.shift(); photo; photo = queue.shift()) {
      const head = await downloadObjectRange("galleries", photo.storage_path, HEAD_BYTES);
      // A failed download is still marked checked (with no date): leaving it unchecked would keep
      // `remaining` above 0 forever for a missing object and the client's loop would never end.
      const takenAt = head ? exifDateTimeOriginal(head) : null;
      const { error: updateError } = await admin
        .from("gallery_photos")
        .update({ taken_at: takenAt ? takenAt.toISOString() : null, taken_at_checked_at: new Date().toISOString() })
        .eq("id", photo.id);
      if (updateError) continue;
      checked++;
      if (takenAt) withDate++;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const { count } = await admin
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", galleryId)
    .is("taken_at_checked_at", null);

  return NextResponse.json({ checked, withDate, remaining: count ?? 0 });
}
