import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

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
    .select("id")
    .eq("id", user.id)
    .single();
  if (!photographer) {
    return NextResponse.json({ error: "רק צלם יכול להוסיף חברי צוות" }, { status: 403 });
  }

  const { name, email }: { name: string; email: string } = await request.json();
  if (!name || !email) {
    return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
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
