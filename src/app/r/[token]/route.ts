import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { fetchReceiptPdf } from "@/lib/receiptFile";

// The short link to a receipt sent to a client on WhatsApp (owner, 2026-10-08): myframeflow.com/
// r/<token>. Shows the receipt's PDF right here on our domain, or forwards to the invoicing
// provider's own page when the PDF can't be fetched. Public: the unguessable token is the access.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const notFound = () => new NextResponse("הקבלה לא נמצאה", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(token)) return notFound();
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("receipt_links").select("document_url").eq("token", token).maybeSingle<{ document_url: string }>();
  if (!data?.document_url) return notFound();
  const pdf = await fetchReceiptPdf(data.document_url);
  if (!pdf) return NextResponse.redirect(data.document_url, 302);
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="receipt.pdf"', "Cache-Control": "private, max-age=300" },
  });
}
