import { createClient } from "@/lib/supabase/client";
import { enqueuePortfolioUpload, otherTabUpload } from "@/lib/galleryUploads";
import { isAllowedImageFile } from "@/lib/imageUpload";
import { folderNameFromPath, isHiddenFileName, type DroppedFile } from "@/lib/fileDrop";

// Putting photos straight into the portfolio, shared by the upload panel (photos and folders to
// tabs) and each tab's drop zone in the manage panel (photos and folders to sub-tabs) — owner,
// 2026-10-10: "כמו בגלריה, גוררים תיקיות והמערכת מייצרת את הלשוניות". Like a gallery, a dropped
// folder becomes a tab (or a sub-tab) named after the folder that directly contains each photo.
// The upload itself runs in the background engine (lib/galleryUploads.ts). Client-only.

// The photographer's hidden portfolio gallery (gallery_photos needs a gallery_id), created on
// first use, excluded from the galleries list. Errors are dictionary keys for the caller's t().
export async function getOrCreatePortfolioGallery(photographerId: string): Promise<{ id: string } | { error: string; message?: string }> {
  const supabase = createClient();
  const { data: existing, error: lookupError } = await supabase
    .from("galleries")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("is_portfolio_only", true)
    .maybeSingle<{ id: string }>();
  // A real error here (not just "no row yet", which maybeSingle reports as no error at all) must
  // stop, not fall through to creating a second portfolio gallery.
  if (lookupError) return { error: "שגיאה בבדיקת מאגר הפורטפוליו: {message}", message: lookupError.message };
  if (existing) return { id: existing.id };

  const { data: created, error: createError } = await supabase
    .from("galleries")
    .insert({
      photographer_id: photographerId,
      event_id: null,
      title: "פורטפוליו | תמונות שהועלו ישירות",
      is_portfolio_only: true,
      published: false,
      // Never used (this gallery is never published, so nothing expires) — just satisfies the
      // enforce_gallery_expiry_by_plan trigger, which rejects a null expiry_days on every insert.
      expiry_days: 7,
    })
    .select("id")
    .single<{ id: string }>();
  if (createError || !created) return { error: createError?.message ?? "שגיאה ביצירת מאגר הפורטפוליו" };
  return { id: created.id };
}

// A picker's files (a folder picker fills webkitRelativePath) in the shape a drop produces.
export function droppedFromFileList(list: FileList | File[]): DroppedFile[] {
  return Array.from(list).map((file) => ({ file, relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }));
}

// The images among dropped/picked files, each with the folder that directly contains it (null for a
// loose file), and how many weren't images.
export function portfolioImages(dropped: DroppedFile[]): { images: { file: File; folder: string | null }[]; rejected: number } {
  const visible = dropped.filter((d) => !isHiddenFileName(d.file.name));
  const images = visible.filter((d) => isAllowedImageFile(d.file)).map((d) => ({ file: d.file, folder: folderNameFromPath(d.relativePath) }));
  return { images, rejected: visible.length - images.length };
}

export type PortfolioUploadGroup = { category: string | null; subcategory: string | null; files: File[] };

// Groups files by where they go, keeping the order they came in.
export function groupPortfolioFiles(entries: { file: File; category: string | null; subcategory: string | null }[]): PortfolioUploadGroup[] {
  const groups = new Map<string, PortfolioUploadGroup>();
  for (const { file, category, subcategory } of entries) {
    const key = JSON.stringify([category, category ? subcategory : null]);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { category, subcategory: category ? subcategory : null, files: [] }));
    group.files.push(file);
  }
  return [...groups.values()];
}

// Starts (or joins) the portfolio upload. Returns an error (a dictionary key, with its message
// variable when it has one) or null.
export async function queuePortfolioUpload(photographerId: string, groups: PortfolioUploadGroup[]): Promise<{ error: string; message?: string } | null> {
  const nonEmpty = groups.filter((g) => g.files.length > 0);
  if (nonEmpty.length === 0) return null;
  // One tab uploads at a time (two would only split the connection between them).
  if (otherTabUpload()) return { error: "כבר מתבצעת העלאה בחלון אחר. אפשר להעלות כאן כשהיא תסתיים." };
  const gallery = await getOrCreatePortfolioGallery(photographerId);
  if ("error" in gallery) return gallery;
  for (const g of nonEmpty) {
    enqueuePortfolioUpload({ galleryId: gallery.id, userId: photographerId, category: g.category?.trim() || null, subcategory: g.subcategory?.trim() || null, files: g.files });
  }
  return null;
}

// Videos straight to the portfolio (owner, 2026-10-16; PortfolioVideoUploadPanel). A dragged folder
// becomes a tab named after it, and a folder inside it a sub-tab (the folder that directly holds
// the video): "חתונות/דנה ואורי/clip.mp4" → tab "חתונות", sub-tab "דנה ואורי". A loose video has
// no tab ("כללי").
const VIDEO_FILE = /\.(mp4|m4v|mov|webm)$/i;

export function isPortfolioVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || VIDEO_FILE.test(file.name);
}

export type PortfolioVideoEntry = { file: File; tab: string | null; sub: string | null };

export function portfolioVideos(dropped: DroppedFile[], maxBytes: number): { videos: PortfolioVideoEntry[]; rejected: number; tooBig: File[] } {
  const visible = dropped.filter((d) => !isHiddenFileName(d.file.name));
  const candidates = visible.filter((d) => isPortfolioVideoFile(d.file));
  const tooBig = candidates.filter((d) => d.file.size > maxBytes).map((d) => d.file);
  const videos = candidates
    .filter((d) => d.file.size <= maxBytes)
    .map((d) => {
      const parts = d.relativePath.split("/").map((p) => p.trim()).filter(Boolean);
      return { file: d.file, tab: parts.length >= 2 ? parts[0] : null, sub: parts.length >= 3 ? parts[parts.length - 2] : null };
    });
  return { videos, rejected: visible.length - candidates.length, tooBig };
}
