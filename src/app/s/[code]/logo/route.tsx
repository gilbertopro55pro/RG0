import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { resolveShortLink } from "@/lib/shortLinkTarget";
import { downloadObjectBuffer } from "@/lib/storage";

// The small square on a short client link's card (../route.ts): the studio's logo on white. 240px,
// under WhatsApp's 300px, so the card shows it as a thumbnail and not as a banner over the message.
// No logo (or one this renderer can't draw): the app's own small icon.

const SIZE = 240;
const LOGO_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await resolveShortLink(code);
  const path = target?.studio.logoPath;
  const ext = path?.split(".").pop()?.toLowerCase() ?? "";
  const buf = path && LOGO_TYPES[ext] ? await downloadObjectBuffer("logos", path).catch(() => null) : null;
  if (!buf) return NextResponse.redirect(new URL("/icons/icon-192.png", request.url), 307);
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
