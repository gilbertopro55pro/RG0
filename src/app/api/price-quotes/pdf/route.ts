import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadObjectBuffer } from "@/lib/storage";
import { buildPriceQuotePdf } from "@/lib/priceQuotePdf";
import type { Photographer, PriceQuoteItem } from "@/lib/types";

export const runtime = "nodejs";

// Renders a proposal PDF straight from the current form draft — used both for "תצוגה מקדימה"
// (an unsaved draft never touches the DB) and by the send route (which passes a saved quote's
// own fields through the same builder, so preview and sent document are guaranteed identical).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { clientName, items, subtotal, vatAmount, total, showVat, eventDetails, notes }: {
    clientName: string;
    items: PriceQuoteItem[];
    subtotal: number;
    vatAmount: number;
    total: number;
    showVat?: boolean;
    eventDetails?: { type?: string; date?: string; location?: string; workHours?: string };
    notes?: string;
  } = await request.json();

  const { data: photographer } = await supabase
    .from("photographers")
    .select("name, phone, email, logo_storage_path, business_id")
    .eq("id", user.id)
    .single<Pick<Photographer, "name" | "phone" | "email" | "logo_storage_path" | "business_id">>();
  if (!photographer) {
    return NextResponse.json({ error: "לא נמצא פרופיל צלם" }, { status: 404 });
  }

  const logoBuffer = photographer.logo_storage_path
    ? await downloadObjectBuffer("logos", photographer.logo_storage_path)
    : null;

  const pdfBytes = await buildPriceQuotePdf({
    photographer,
    logoBuffer,
    clientName: clientName || "",
    items: items || [],
    subtotal: subtotal || 0,
    vatAmount: vatAmount || 0,
    total: total || 0,
    createdAt: new Date(),
    showVat,
    eventDetails,
    notes,
  });

  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=\"price-quote.pdf\"" },
  });
}
