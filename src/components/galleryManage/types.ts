import type { GalleryPhotoRow } from "@/lib/types";

export type PhotoWithUrl = GalleryPhotoRow & { url: string; previewUrl?: string | null };

export type ZipJobPart = {
  partIndex: number;
  partCount: number;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  downloadUrl: string | null;
  processedCount: number;
  totalCount: number;
};
export type ZipBatchState = { batchId: string; parts: ZipJobPart[] };
