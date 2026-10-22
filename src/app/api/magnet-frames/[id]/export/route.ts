import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { renderMagnetFramePng } from "@/lib/magnetFrame";
import { loadMagnetDesign } from "@/lib/magnetFrameLoad";
import type { FrameOrientation } from "@/lib/types";

// Renders on demand rather than persisting to storage like frame_requests does — composition here
// is cheap/deterministic (no AI call), so there's nothing worth caching, and every export always
// reflects whatever was last saved. The file is at the design's print size (settings.sizeKey); a
// square size has one frame, whichever orientation is asked for. The browser names the file.
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

  const png = await renderMagnetFramePng(design.orientation, design);
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
}
