import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { SUBSCRIPTION_PLANS, TEAM_MEMBER_LIMIT_BY_TIER } from "@/lib/stages";

function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("id, plan")
    .eq("id", user.id)
    .single<{ id: string; plan: import("@/lib/stages").SubscriptionPlan }>();
  if (!photographer) {
    return NextResponse.json({ error: "רק צלם יכול להוסיף חברי צוות" }, { status: 403 });
  }

  const { name, email }: { name: string; email: string } = await request.json();
  if (!name || !email) {
    return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
  }

  const limit = TEAM_MEMBER_LIMIT_BY_TIER[SUBSCRIPTION_PLANS[photographer.plan].tier];
  const { count: existingCount } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", user.id);
  if ((existingCount ?? 0) >= limit) {
    return NextResponse.json({
      error:
        limit === 1
          ? "ניתן להוסיף עוזר אחד בלבד לכל חשבון, מסלול פרו+ מאפשר עד 3"
          : `ניתן להוסיף עד ${limit} חברי צוות במסלול פרו+`,
    }, { status: 403 });
  }

  const password = generatePassword();
  const serviceRole = createServiceRoleClient();

  const { data: created, error: createError } = await serviceRole.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "שגיאה ביצירת המשתמש" }, { status: 500 });
  }

  const { error: insertError } = await serviceRole.from("team_members").insert({
    id: created.user.id,
    photographer_id: user.id,
    name,
    email,
  });
  if (insertError) {
    await serviceRole.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ id: created.user.id, name, email, password });
}
