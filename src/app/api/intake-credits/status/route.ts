import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Polled by /billing/intake-success until the webhook marks the purchase paid.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("purchase") ?? "";
  // RLS: a photographer reads only their own purchases.
  const [{ data: purchase }, { data: photographer }] = await Promise.all([
    supabase.from("intake_credit_purchases").select("status, conversations, receipt_link").eq("id", id).maybeSingle<{ status: string; conversations: number; receipt_link: string | null }>(),
    supabase.from("photographers").select("intake_extra_conversations").eq("id", user.id).maybeSingle<{ intake_extra_conversations: number }>(),
  ]);
  if (!purchase) return NextResponse.json({ error: "הרכישה לא נמצאה" }, { status: 404 });
  return NextResponse.json({
    status: purchase.status,
    conversations: purchase.conversations,
    balance: photographer?.intake_extra_conversations ?? 0,
    receiptLink: purchase.receipt_link,
  });
}
