import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { quoteHistoryPdf } from "@/lib/quoteHistoryPdf";

export const runtime = "nodejs";

// A quote from the builder's history as a PDF (QuoteHistoryList's download button).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const pdf = await quoteHistoryPdf(supabase, user.id, id);
  if (!pdf) return NextResponse.json({ error: "הצעת המחיר לא נמצאה" }, { status: 404 });

  return new NextResponse(new Uint8Array(pdf.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=\"price-quote.pdf\"", "Cache-Control": "private, no-store" },
  });
}
