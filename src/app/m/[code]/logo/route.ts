import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { magnetGuestState } from "@/lib/magnetGuest";
import { studioLogoImage } from "@/lib/studioLogoImage";

// The studio's logo on the guests' page (../info) and its link preview: the same small square as
// the short client links (studioLogoImage). Only for a link that's on.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const state = await magnetGuestState(createServiceRoleClient(), code);
  return studioLogoImage(state.kind === "soon" || state.kind === "unavailable" ? state.studio.logoPath : null, request.url);
}
