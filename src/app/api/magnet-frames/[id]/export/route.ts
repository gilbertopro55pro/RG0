import sharp from "sharp";
import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { renderMagnetFrameBase, composeMagnetFrameElements, composeMagnetFrameTexture } from "@/lib/magnetFrame";
import { MAGNET_FRAME_DPI } from "@/lib/magnetFrameShared";
import { loadMagnetDesign } from "@/lib/magnetFrameLoad";
import type { FrameOrientation } from "@/lib/types";

// Renders on demand rather than persisting to storage like frame_requests does — composition here
// is cheap/deterministic (no AI call), so there's nothing worth caching, and every export always
// reflects whatever was last saved.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;

  const orientation = (new URL(request.url).searchParams.get("orientation") ?? "landscape") as FrameOrientation;
  if (orientation !== "landscape" && orientation !== "portrait") {
    return NextResponse.json({ error: "כיוון לא תקין" }, { status: 400 });
  }

  const design = await loadMagnetDesign(supabase, userId, id, orientation);
  if (!design) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });
  const { elements, settings, customTextureImage, customElementBuffers } = design;

  let base = await renderMagnetFrameBase(orientation, settings);
  base = await composeMagnetFrameTexture(base, settings, orientation, customTextureImage);
  const elementsLayer = await composeMagnetFrameElements(elements, orientation, customElementBuffers);
  const composed = await sharp(base).composite([{ input: elementsLayer, left: 0, top: 0 }]).withMetadata({ density: MAGNET_FRAME_DPI }).png().toBuffer();
  return new NextResponse(new Uint8Array(composed), { headers: { "Content-Type": "image/png" } });
}
