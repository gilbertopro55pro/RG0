import { NextResponse } from "next/server";
import { appOrigin, loadReceiptLink } from "@/lib/receiptLinks";
import { makeT } from "@/i18n/translate";
import { messagesFor } from "@/i18n/dict";

// A receipt's short link, sent to the client on WhatsApp (owner, 2026-10-08): myframeflow.com/
// r/<token>. Tapping it goes straight to the issued receipt, with no page in between. Link-preview
// fetchers (WhatsApp, Facebook, iMessage, Telegram…) get a tiny page with only the card's details
// instead (the studio's name and logo, ./og), since that card is all they read. Public: the
// unguessable token is the access.

const PREVIEW_BOTS =
  /WhatsApp|facebookexternalhit|Facebot|TelegramBot|Twitterbot|Slackbot|Discordbot|LinkedInBot|SkypeUriPreview|Viber|Pinterest|redditbot|vkShare|Applebot|Googlebot|bingbot/i;

const NO_STORE = { "Cache-Control": "private, no-store", Vary: "User-Agent", "X-Robots-Tag": "noindex, nofollow" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await loadReceiptLink(token);
  if (!link) return new NextResponse("הקבלה לא נמצאה", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE } });

  if (!PREVIEW_BOTS.test(request.headers.get("user-agent") ?? "")) {
    return NextResponse.redirect(link.documentUrl, { status: 302, headers: NO_STORE });
  }

  const t = makeT(messagesFor(link.lang));
  const title = link.studio.name ? `${link.studio.name} | ${t("קבלה על תשלום")}` : t("קבלה על תשלום");
  const description = t("לצפייה בקבלה ולהורדה שלה");
  const image = `${appOrigin(request)}/r/${token}/og`;
  const html = `<!doctype html>
<html lang="${link.lang}"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${link.studio.name ? `<meta property="og:site_name" content="${esc(link.studio.name)}">\n` : ""}<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
</head><body><a href="${esc(link.documentUrl)}">${esc(description)}</a></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
}
