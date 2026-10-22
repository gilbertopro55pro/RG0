import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { loadMagnetDesign } from "@/lib/magnetFrameLoad";
import { renderMagnetFramePsd } from "@/lib/magnetFramePsd";
import { magnetSizeLabel } from "@/lib/magnetFrameShared";
import { getSignedDownloadUrl, uploadObject } from "@/lib/storage";
import type { FrameOrientation } from "@/lib/types";

export const maxDuration = 60;

// The layered Photoshop file of a saved design (see renderMagnetFramePsd), at the design's print
// size. It goes to storage and the browser gets a signed link instead of the bytes: a PSD with a
// rich texture can pass Vercel's 4.5MB response limit. One object per design and orientation,
// overwritten on each download, under the photographer's id (so deleting the account removes it).
// A square size has one frame, whichever orientation is asked for.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const requested = (new URL(request.url).searchParams.get("orientation") ?? "landscape") as FrameOrientation;
  if (requested !== "landscape" && requested !== "portrait") {
    return NextResponse.json({ error: "כיוון לא תקין" }, { status: 400 });
  }

  const design = await loadMagnetDesign(supabase, userId, id, requested);
  if (!design) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });
  const { orientation } = design;

  const psd = await renderMagnetFramePsd(orientation, design);
  const path = `${userId}/${id}-${orientation}.psd`;
  await uploadObject("magnet-frame-exports", path, psd, "image/vnd.adobe.photoshop");
  // An ASCII name: a Hebrew filename* was dropped by Chromium in testing (saved as "download", no
  // extension), and the name has to survive every browser for the file to open in Photoshop.
  // The size as it reads for the orientation: magnet-frame-20x15.psd, magnet-frame-15x20.psd.
  const filename = `magnet-frame-${magnetSizeLabel(design.settings.sizeKey, orientation).replace("×", "x")}.psd`;
  const url = await getSignedDownloadUrl("magnet-frame-exports", path, 600, filename);
  return NextResponse.json({ url });
}
