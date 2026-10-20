import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { downloadObjectBuffer } from "@/lib/storage";

// The small square on a link's preview card: the studio's logo on white. 240px, under WhatsApp's
// 300px, so the card shows it as a thumbnail and not as a banner over the message. No logo (or one
// this renderer can't draw): the app's own small icon. Shared by the short client links
// (/s/<code>/logo) and the portfolio's links (/p/<slug>/og).

const SIZE = 240;
const LOGO_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

export async function studioLogoImage(logoPath: string | null | undefined, requestUrl: string): Promise<Response> {
  const ext = logoPath?.split(".").pop()?.toLowerCase() ?? "";
  const buf = logoPath && LOGO_TYPES[ext] ? await downloadObjectBuffer("logos", logoPath).catch(() => null) : null;
  if (!buf) return NextResponse.redirect(new URL("/icons/icon-192.png", requestUrl), 307);
  const logo = `data:${LOGO_TYPES[ext]};base64,${buf.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo} width={SIZE - 40} height={SIZE - 40} style={{ objectFit: "contain" }} />
      </div>
    ),
    { width: SIZE, height: SIZE, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}

export const STUDIO_LOGO_SIZE = SIZE;
