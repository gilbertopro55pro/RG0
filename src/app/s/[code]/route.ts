import { NextResponse } from "next/server";
import { resolveShortLink } from "@/lib/shortLinkTarget";
import { forwardedSearch } from "@/lib/shortLinks";
import { PREVIEW_BOTS } from "@/lib/previewBots";
import { appOrigin } from "@/lib/receiptLinks";
import { makeT } from "@/i18n/translate";
import { messagesFor } from "@/i18n/dict";

// A short client link (lib/shortLinks.ts): myframeflow.com/s/<code> → the portal, gallery, quote or
// contract it stands for, with its query ("?folders=…") kept. Link-preview fetchers get a small
// card instead (owner, 2026-10-16: no huge banner on a shared link): the studio's name, one line in
// the client's language, and the studio's logo as a small square (./logo, under 300px wide, which
// WhatsApp shows as a thumbnail beside the text). A gallery's own preview (its cover photo) stays.

const NO_STORE = { "Cache-Control": "private, no-store", Vary: "User-Agent", "X-Robots-Tag": "noindex, nofollow" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CARD = {
  portal: { title: "הפורטל האישי שלכם", line: "הפורטל האישי שלכם: סטטוס האירוע והתשלומים" },
  quote: { title: "הצעת מחיר", line: "הצעת מחיר לצפייה ולאישור" },
  contract: { title: "חוזה לחתימה", line: "חוזה לחתימה דיגיטלית" },
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await resolveShortLink(code);
  const url = new URL(request.url);
  if (!target) {
    const t = makeT(messagesFor("he"));
    return new NextResponse(t("הקישור לא נמצא"), { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE } });
  }

  const dest = new URL(`${target.path}${forwardedSearch(url.search)}`, url.origin);
  if (target.kind === "gallery" || !PREVIEW_BOTS.test(request.headers.get("user-agent") ?? "")) {
    return NextResponse.redirect(dest, { status: 307, headers: NO_STORE });
  }

  const t = makeT(messagesFor(target.lang));
  const card = CARD[target.kind];
  const title = target.studio.name.trim() || t(card.title);
  const description = t(card.line);
  const origin = appOrigin(request);
  const image = `${origin}/s/${code}/logo`;
  const dir = target.lang === "he" ? "rtl" : "ltr";
  const html = `<!doctype html>
<html lang="${target.lang}" dir="${dir}"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(`${origin}/s/${code}`)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="${esc(title)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="240">
<meta property="og:image:height" content="240">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
</head><body><a href="${esc(dest.toString())}">${esc(description)}</a></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
}
