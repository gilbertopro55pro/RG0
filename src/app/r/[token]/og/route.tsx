import { ImageResponse } from "next/og";
import { loadReceiptLink } from "@/lib/receiptLinks";
import { downloadObjectBuffer } from "@/lib/storage";

// The picture on the WhatsApp card for a receipt's short link (owner, 2026-10-08): the studio's
// logo on a gold ring over the quote PDF's navy, with a small receipt badge. No text in the image:
// the card's own title and description carry it (the image renderer doesn't lay out Hebrew
// right-to-left). Centred, so it still reads when WhatsApp crops it to a square thumbnail.

const NAVY = "#0b1220";
const GOLD = "#8f6f2f";
const GOLD_LIGHT = "#c9a15a";

const LOGO_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

function ReceiptGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2.5h12v19l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9 7.5h6M9 11h6M9 14.5h3.5" />
    </svg>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await loadReceiptLink(token);
  let logo: string | null = null;
  const ext = link?.studio.logoPath?.split(".").pop()?.toLowerCase() ?? "";
  if (link?.studio.logoPath && LOGO_TYPES[ext]) {
    const buf = await downloadObjectBuffer("logos", link.studio.logoPath).catch(() => null);
    if (buf) logo = `data:${LOGO_TYPES[ext]};base64,${buf.toString("base64")}`;
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: NAVY, borderBottom: `14px solid ${GOLD}` }}>
        <div style={{ position: "relative", display: "flex" }}>
          <div
            style={{
              width: 380,
              height: 380,
              borderRadius: 190,
              background: "#ffffff",
              border: `10px solid ${GOLD}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={logo} width={250} height={250} style={{ objectFit: "contain" }} />
            ) : (
              <ReceiptGlyph size={200} color={NAVY} />
            )}
          </div>
          {logo && (
            <div
              style={{
                position: "absolute",
                right: -6,
                bottom: 8,
                width: 112,
                height: 112,
                borderRadius: 56,
                background: GOLD_LIGHT,
                border: `8px solid ${NAVY}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ReceiptGlyph size={60} color={NAVY} />
            </div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
