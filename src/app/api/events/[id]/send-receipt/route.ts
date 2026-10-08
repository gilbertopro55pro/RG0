import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { fetchReceiptPdf } from "@/lib/receiptFile";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Emails a payment leg's latest receipt to the client, with the PDF attached when it can be
// fetched from the provider and the link always in the text (owner, 2026-10-08).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const { field, email: rawEmail }: { field: "deposit" | "balance"; email?: string } = await request.json();
  const email = rawEmail?.trim() ?? "";
  if ((field !== "deposit" && field !== "balance") || !isEmail(email)) {
    return NextResponse.json({ error: "כתובת מייל לא תקינה" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { data: event } = await supabase
    .from("events")
    .select("photographer_id, client_name, client_email")
    .eq("id", eventId)
    .maybeSingle<{ photographer_id: string; client_name: string; client_email: string | null }>();
  if (!event || event.photographer_id !== user.id) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

  const { data: payment } = await supabase
    .from("event_payments")
    .select(`${field}_document_url`)
    .eq("event_id", eventId)
    .maybeSingle<Record<string, string | null>>();
  const documentUrl = payment?.[`${field}_document_url`];
  if (!documentUrl) return NextResponse.json({ error: "לא נמצאה קבלה" }, { status: 404 });

  const { data: photographer } = await supabase.from("photographers").select("name, email").eq("id", user.id).single<{ name: string; email: string | null }>();
  const name = photographer?.name ?? "";
  const pdf = await fetchReceiptPdf(documentUrl);
  try {
    await sendEmail({
      to: email,
      subject: `קבלה על תשלום | ${name}`,
      text: `שלום ${event.client_name},\n\nמצורפת קבלה על התשלום שהתקבל.\nלצפייה בקבלה: ${documentUrl}\n\nתודה,\n${name}`,
      fromName: name,
      replyTo: photographer?.email ? notificationEmailFor(photographer.email) : undefined,
      attachments: pdf ? [{ filename: "receipt.pdf", content: Buffer.from(pdf).toString("base64") }] : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שליחת המייל נכשלה" }, { status: 500 });
  }
  if (!event.client_email) await supabase.from("events").update({ client_email: email }).eq("id", eventId);
  return NextResponse.json({ ok: true, attached: !!pdf });
}
