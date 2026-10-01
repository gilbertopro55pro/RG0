import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Saves (POST) or removes (DELETE) this device's push subscription for the signed-in photographer
// (lib/push.ts). The endpoint is unique: a device that signs in to another account moves to it.
type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

async function photographerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: Request) {
  const id = await photographerId();
  if (!id) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
    return NextResponse.json({ error: "פרטי מכשיר לא תקינים" }, { status: 400 });
  }
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      { photographer_id: id, endpoint, p256dh, auth, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) },
      { onConflict: "endpoint" }
    );
  if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = await photographerId();
  if (!id) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ ok: true });
  await createServiceRoleClient().from("push_subscriptions").delete().eq("photographer_id", id).eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
