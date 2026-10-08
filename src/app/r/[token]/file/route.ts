import { NextResponse } from "next/server";
import { fetchReceiptPdf } from "@/lib/receiptFile";
import { loadReceiptLink } from "@/lib/receiptLinks";

// The receipt's PDF behind the short link's page (app/r/[token]): shown right here on our domain,
// or the invoicing provider's own page when the PDF can't be fetched. ?download=1 saves it instead.
// Public: the unguessable token is the access.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await loadReceiptLink(token);
  if (!link) return new NextResponse("הקבלה לא נמצאה", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const pdf = await fetchReceiptPdf(link.documentUrl);
  if (!pdf) return NextResponse.redirect(link.documentUrl, 302);
  const download = new URL(request.url).searchParams.has("download");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="receipt.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
