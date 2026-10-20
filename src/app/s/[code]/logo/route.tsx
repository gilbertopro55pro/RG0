import { resolveShortLink } from "@/lib/shortLinkTarget";
import { studioLogoImage } from "@/lib/studioLogoImage";

// The small square on a short client link's card (../route.ts): the studio's logo (studioLogoImage).
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await resolveShortLink(code);
  return studioLogoImage(target?.studio.logoPath, request.url);
}
