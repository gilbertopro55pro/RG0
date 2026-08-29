import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSignedDownloadUrl } from "@/lib/storage";
import type { GalleryRow, GalleryZipJobRow } from "@/lib/types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; batchId: string }> }) {
  const { token, batchId } = await params;
  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, title")
    .eq("access_token", token)
    .maybeSingle<Pick<GalleryRow, "id" | "title">>();
  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const { data: jobs } = await supabase
    .from("gallery_zip_jobs")
    .select("part_index, part_count, status, storage_path, error_message, processed_count, total_count")
    .eq("batch_id", batchId)
    .eq("gallery_id", gallery.id)
    .order("part_index", { ascending: true })
    .returns<
      Pick<
        GalleryZipJobRow,
        "part_index" | "part_count" | "status" | "storage_path" | "error_message" | "processed_count" | "total_count"
      >[]
    >();

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
  }

  const parts = await Promise.all(
    jobs.map(async (job) => ({
      partIndex: job.part_index,
      partCount: job.part_count,
      status: job.status,
      errorMessage: job.error_message,
      processedCount: job.processed_count,
      totalCount: job.total_count,
      downloadUrl:
        job.status === "ready" && job.storage_path
          ? await getSignedDownloadUrl(
              "galleries",
              job.storage_path,
              60 * 60,
              job.part_count > 1 ? `${gallery.title} - חלק ${job.part_index + 1}.zip` : `${gallery.title}.zip`
            )
          : null,
    }))
  );

  return NextResponse.json({ parts });
}
