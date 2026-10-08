import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchReceiptPdf } from "@/lib/receiptFile";

// The PDF of a payment leg's latest receipt, for the phone's share sheet (owner, 2026-10-08).
// Served from our own domain since the provider's page can't be fetched by the browser directly.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const field = new URL(request.url).searchParams.get("field");
  if (field !== "deposit" && field !== "balance") {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { data: event } = await supabase.from("events").select("photographer_id").eq("id", eventId).maybeSingle<{ photographer_id: string }>();
  if (!event || event.photographer_id !== user.id) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

  const { data: payment } = await supabase
    .from("event_payments")
    .select(`${field}_document_url`)
    .eq("event_id", eventId)
    .maybeSingle<Record<string, string | null>>();
  const documentUrl = payment?.[`${field}_document_url`];
  if (!documentUrl) return NextResponse.json({ error: "לא נמצאה קבלה" }, { status: 404 });

  const pdf = await fetchReceiptPdf(documentUrl);
  if (!pdf) return NextResponse.json({ error: "לא הצלחנו להוריד את קובץ הקבלה", url: documentUrl }, { status: 502 });
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="receipt.pdf"', "Cache-Control": "private, no-store" },
  });
}
