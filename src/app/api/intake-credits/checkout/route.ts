import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createPayplusOneTimeLink } from "@/lib/payplus";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { hasAppAccess } from "@/lib/subscription";
import { INTAKE_PACK_TAG, canBuyIntakePacks, intakePack } from "@/lib/intakeCredits";
import type { Photographer } from "@/lib/types";

// Buying a pack of extra assistant conversations: a pending purchase row, then a one-time PayPlus
// payment page. The conversations are added by the webhook once PayPlus reports the charge.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { data: photographer } = await supabase
    .from("photographers")
    .select("id, name, email, phone, subscription_status, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle<Pick<Photographer, "id" | "name" | "email" | "phone" | "subscription_status" | "trial_ends_at">>();
  if (!photographer) return NextResponse.json({ error: "החשבון לא נמצא" }, { status: 403 });
  if (!canBuyIntakePacks(photographer.email)) return NextResponse.json({ error: "הרכישה עדיין לא זמינה בחשבון הזה" }, { status: 403 });
  if (!hasAppAccess(photographer)) return NextResponse.json({ error: "צריך מנוי פעיל כדי לרכוש שיחות" }, { status: 403 });

  const { conversations }: { conversations?: number } = await request.json().catch(() => ({}));
  const pack = intakePack(Number(conversations));
  if (!pack) return NextResponse.json({ error: "חבילה לא תקינה" }, { status: 400 });

  const service = createServiceRoleClient();
  const { data: purchase, error } = await service
    .from("intake_credit_purchases")
    .insert({ photographer_id: photographer.id, conversations: pack.conversations, amount: pack.price })
    .select("id")
    .single<{ id: string }>();
  if (error || !purchase) return NextResponse.json({ error: "פתיחת הרכישה נכשלה" }, { status: 500 });

  try {
    const baseUrl = new URL(request.url).origin;
    const { paymentPageLink } = await createPayplusOneTimeLink({
      photographerId: photographer.id,
      amount: pack.price,
      tag: `${INTAKE_PACK_TAG}${purchase.id}`,
      customerName: photographer.name,
      customerEmail: notificationEmailFor(photographer.email),
      customerPhone: photographer.phone,
      successUrl: `${baseUrl}/billing/intake-success?purchase=${purchase.id}`,
      failureUrl: `${baseUrl}/settings?tab=automation&intakePurchase=failed`,
      baseUrl,
    });
    return NextResponse.json({ url: paymentPageLink });
  } catch (e) {
    await service.from("intake_credit_purchases").update({ status: "failed" }).eq("id", purchase.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה ביצירת קישור לתשלום" }, { status: 500 });
  }
}
