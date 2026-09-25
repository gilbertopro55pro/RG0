import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import {
  diagnoseNumber,
  registerWhatsAppNumber,
  subscribeAppToWaba,
  whatsappNumberStatus,
  whatsappTokenOverview,
} from "@/lib/whatsappNumbers";

export const runtime = "nodejs";

const ID_RE = /^\d{6,20}$/;

// Admin only: the intake bot's WhatsApp number (settings → אוטומציה). Status from Graph API (the
// token is a sensitive Vercel variable, so only a deployment can ask), registering a verified
// number with its PIN, subscribing the app to its WABA, and connecting it to the bot.
async function adminPhotographer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return null;
  const service = createServiceRoleClient();
  const { data } = await service
    .from("photographers")
    .select("id, whatsapp_bot_phone_number_id")
    .eq("id", user.id)
    .maybeSingle<{ id: string; whatsapp_bot_phone_number_id: string | null }>();
  return data ? { ...data, service } : null;
}

async function overviewFor(id: string, connectedId: string | null) {
  const [status, tokenInfo, appNumber] = await Promise.all([
    whatsappNumberStatus(id),
    whatsappTokenOverview(),
    process.env.WHATSAPP_PHONE_NUMBER_ID ? whatsappNumberStatus(process.env.WHATSAPP_PHONE_NUMBER_ID) : Promise.resolve(null),
  ]);
  const waba = tokenInfo.wabas.find((w) => w.numbers.some((n) => n.id === id)) ?? null;
  return {
    id,
    connectedId,
    status,
    diagnosis: diagnoseNumber(status, !!waba, !!waba?.appSubscribed),
    waba: waba ? { id: waba.id, appSubscribed: waba.appSubscribed } : null,
    token: tokenInfo.token,
    appNumber: appNumber
      ? { display: appNumber.display_phone_number ?? null, status: appNumber.status ?? null, error: appNumber.error?.message ?? null }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const admin = await adminPhotographer();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id") || admin.whatsapp_bot_phone_number_id;
  if (!id || !ID_RE.test(id)) return NextResponse.json({ error: "חסר מזהה מספר (Phone number ID)" }, { status: 400 });
  return NextResponse.json(await overviewFor(id, admin.whatsapp_bot_phone_number_id));
}

export async function POST(request: NextRequest) {
  const admin = await adminPhotographer();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: string; pin?: string; wabaId?: string };
  const id = body.id ?? "";

  if (body.action === "disconnect") {
    await admin.service.from("photographers").update({ whatsapp_bot_phone_number_id: null }).eq("id", admin.id);
    return NextResponse.json({ ok: true });
  }
  if (!ID_RE.test(id)) return NextResponse.json({ error: "מזהה מספר לא תקין" }, { status: 400 });

  if (body.action === "register") {
    if (!/^\d{6}$/.test(body.pin ?? "")) return NextResponse.json({ error: "קוד PIN צריך להיות 6 ספרות" }, { status: 400 });
    const result = await registerWhatsAppNumber(id, body.pin!);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }
  if (body.action === "subscribe") {
    if (!body.wabaId || !ID_RE.test(body.wabaId)) return NextResponse.json({ error: "מזהה חשבון לא תקין" }, { status: 400 });
    const result = await subscribeAppToWaba(body.wabaId);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }
  if (body.action === "connect") {
    // The app's own sending number serves every photographer's messages; the bot gets its own.
    if (id === process.env.WHATSAPP_PHONE_NUMBER_ID) {
      return NextResponse.json({ error: "זה המספר שהמערכת שולחת ממנו הודעות לכל הצלמים. לבוט צריך מספר נפרד." }, { status: 400 });
    }
    const status = await whatsappNumberStatus(id);
    if (status.status !== "CONNECTED") {
      return NextResponse.json({ error: "אפשר לחבר רק מספר פעיל (CONNECTED). קודם לרשום אותו." }, { status: 409 });
    }
    const { error } = await admin.service.from("photographers").update({ whatsapp_bot_phone_number_id: id }).eq("id", admin.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });
}
