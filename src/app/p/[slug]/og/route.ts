import sharp from "sharp";
import { loadPortfolio, portfolioTabNames, tabCoverPhoto, tabCoverVideo } from "@/lib/portfolio";
import { tabsForShareCode } from "@/lib/portfolioShareCode";
import { downloadObjectBuffer, getPublicPreviewUrl } from "@/lib/storage";
import { studioLogoImage } from "@/lib/studioLogoImage";

// The picture on a portfolio link's preview card (owner, 2026-10-20): a link to one tab shows that
// tab's cover photo, large (1200×630); the whole portfolio, or a few tabs, the studio's logo as a
// small square (studioLogoImage). `?t=` is the one tab's code (lib/portfolioShareCode.ts). A tab with
// only videos shows its newest video's still frame; no cover at all, or one that can't be read,
// falls back to the logo.

const W = 1200;
const H = 630;

async function previewBytes(path: string): Promise<Buffer | null> {
  if (path.endsWith(".webp")) {
    const res = await fetch(getPublicPreviewUrl(path)).catch(() => null);
    return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  return downloadObjectBuffer("galleries", path).catch(() => null);
}

// A wide photo fills the card; any other is shown whole over a blurred, darker copy of itself, so a
// portrait cover never loses the heads to the card's shape.
async function coverCard(bytes: Buffer): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const aspect = meta.width && meta.height ? meta.width / meta.height : 1;
  if (aspect >= 1.6) return sharp(bytes).resize(W, H, { fit: "cover", position: "attention" }).jpeg({ quality: 82 }).toBuffer();
  const backdrop = await sharp(bytes).resize(W, H, { fit: "cover" }).blur(28).modulate({ brightness: 0.7 }).toBuffer();
  const photo = await sharp(bytes).resize(W, H, { fit: "inside" }).toBuffer();
  return sharp(backdrop).composite([{ input: photo, gravity: "center" }]).jpeg({ quality: 82 }).toBuffer();
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPortfolio(slug);
  if (!data) return studioLogoImage(null, request.url);
  const code = new URL(request.url).searchParams.get("t");
  const tabs = code ? tabsForShareCode(code, portfolioTabNames(data.photos, data.videos)) : [];
  if (tabs.length === 1) {
    // A tab with only videos: its newest video's still frame (migration 0188).
    const cover = tabCoverPhoto(data.photos, data.photographer.portfolio_category_covers, tabs[0]);
    const path = cover ? cover.preview_storage_path : (tabCoverVideo(data.videos, tabs[0])?.poster_path ?? null);
    const bytes = path ? await previewBytes(path) : null;
    if (bytes) {
      try {
        const card = await coverCard(bytes);
        return new Response(new Uint8Array(card), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" } });
      } catch (e) {
        console.error("[p/og] cover failed", e);
      }
    }
  }
  return studioLogoImage(data.photographer.logo_storage_path, request.url);
}
